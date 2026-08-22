/**
 * One-off data migration: copy the legacy MongoDB (dev) into the new Postgres
 * database created by the MikroORM migrations. Schema is NOT touched here — run
 * `migration:up` first so the 11 tables exist.
 *
 * What it does
 *  - Reads every collection RAW via the mongodb driver (no Mongoose models, so
 *    `select:false` fields such as `password` / `hashedRefreshToken` are copied).
 *  - Replaces each document's Mongo ObjectId with a fresh uuid v4 and rewrites
 *    every reference field through a global id-map, preserving all relations.
 *  - Everything else is copied verbatim (password hashes included).
 *
 * Connections come from the environment ONLY:
 *   MONGODB_URI, PG_HOST, PG_PASSWORD, PG_DBNAME, PG_USER
 *
 * Usage:
 *   bun run scripts/migrate-mongo-to-pg.ts            # truncate + load
 *   bun run scripts/migrate-mongo-to-pg.ts --dry-run  # validate, no writes
 *
 * The target tables are TRUNCATEd before loading (fresh dev DB).
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { Client as PgClient } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const MONGODB_URI = requireEnv('MONGODB_URI');
const PG_HOST_RAW = requireEnv('PG_HOST');
const PG_PASSWORD = requireEnv('PG_PASSWORD');
const PG_DBNAME = requireEnv('PG_DBNAME');
const PG_USER = requireEnv('PG_USER');

// PG_HOST may be a bare host ("ep-x.neon.tech") or a full connection URL
// ("postgresql://ep-x.neon.tech/?sslmode=require"). Extract host + port.
function parsePgHost(raw: string): { host: string; port: number } {
  if (raw.includes('://')) {
    const u = new URL(raw);
    return { host: u.hostname, port: u.port ? Number(u.port) : 5432 };
  }
  const [host, port] = raw.split(':');
  return { host, port: port ? Number(port) : 5432 };
}
const { host: PG_HOST, port: PG_PORT } = parsePgHost(PG_HOST_RAW);

// ---------------------------------------------------------------------------
// Id map: collectionKey -> (mongoHexId -> newUuid)
// ---------------------------------------------------------------------------
type Coll =
  | 'businesses'
  | 'users'
  | 'customers'
  | 'resources'
  | 'orders'
  | 'invoices'
  | 'appointments'
  | 'email_changes'
  | 'admins'
  | 'verification_codes'
  | 'mails';

const idMap: Record<Coll, Map<string, string>> = {
  businesses: new Map(),
  users: new Map(),
  customers: new Map(),
  resources: new Map(),
  orders: new Map(),
  invoices: new Map(),
  appointments: new Map(),
  email_changes: new Map(),
  admins: new Map(),
  verification_codes: new Map(),
  mails: new Map(),
};

/** Count of reference values that pointed at a missing doc (kept as-is). */
let danglingCount = 0;
const danglingSamples: string[] = [];

function toHex(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof ObjectId) return v.toHexString();
  return String(v);
}

/**
 * Remap a single reference to its new uuid.
 * - Empty/absent source -> null.
 * - Target present in the map -> the new uuid.
 * - Dangling (target missing): for a NULLABLE column return null (drop the
 *   stale link); for a NOT NULL column keep the original hex so the owning row
 *   still loads rather than being rejected. Both are counted + sampled.
 */
function remap(coll: Coll, raw: unknown, nullable = false): string | null {
  const hex = toHex(raw);
  if (hex == null || hex === '') return null;
  const mapped = idMap[coll].get(hex);
  if (mapped) return mapped;
  danglingCount++;
  if (danglingSamples.length < 20) danglingSamples.push(`${coll}:${hex}`);
  return nullable ? null : hex; // varchar column, no FK.
}

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

/** A NOT NULL timestamp: fall back to now() when the source lacks a valid one. */
function reqDate(v: unknown): Date {
  return asDate(v) ?? new Date();
}

// ---------------------------------------------------------------------------
// Mongo -> mongo source collection names (all default to the class collection)
// ---------------------------------------------------------------------------
const MONGO_COLLECTIONS: Record<Coll, string> = {
  businesses: 'businesses',
  users: 'users',
  customers: 'customers',
  resources: 'resources',
  orders: 'orders',
  invoices: 'invoices',
  appointments: 'appointments',
  email_changes: 'email_changes',
  admins: 'admins',
  verification_codes: 'verification_codes',
  mails: 'mails',
};

// Insertion order: parents before children so reads are intuitive (FKs are not
// enforced in PG, but this keeps logs sensible). Circular refs are already
// resolvable because the id-map is fully built in pass 1.
const LOAD_ORDER: Coll[] = [
  'businesses',
  'users',
  'customers',
  'resources',
  'orders',
  'invoices',
  'appointments',
  'email_changes',
  'admins',
  'verification_codes',
  'mails',
];

// ---------------------------------------------------------------------------
// Row transformers: (mongoDoc) -> { columns, values } for a parameterized insert
// ---------------------------------------------------------------------------
type RowSpec = { columns: string[]; values: unknown[] };

function j(v: unknown): string {
  // jsonb payload; MikroORM stores objects/arrays as JSON text.
  return JSON.stringify(v ?? null);
}

// Check-constraint enum values — must match the migrations exactly. A legacy
// row carrying an out-of-range value would abort the whole atomic load, so such
// rows are quarantined + reported instead.
const ENUMS: Partial<Record<Coll, Record<string, string[]>>> = {
  resources: { type: ['product', 'service'] },
  orders: { status: ['pending', 'completed', 'cancelled'] },
  invoices: {
    invoice_type: ['STANDARD', 'PROFORMA', 'RECEIPT'],
    status: ['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'],
    payment_method: ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CHEQUE'],
  },
  appointments: { status: ['scheduled', 'completed', 'attended', 'cancelled'] },
  mails: {
    type: [
      'verification_code',
      'welcome',
      'existing_user_signin',
      'password_change_requested',
      'password_changed',
      'account_deleted',
      'invoice',
    ],
    status: ['sent', 'failed'],
  },
};

// NOT NULL columns (without a usable DB default) that must carry a value.
// Timestamps are omitted — they are backfilled by reqDate().
const REQUIRED: Record<Coll, string[]> = {
  businesses: ['short_id', 'name', 'owner_id'],
  users: ['short_id', 'first_name', 'email'],
  customers: ['short_id', 'business_id', 'name'],
  resources: ['short_id', 'business_id', 'type', 'name', 'price'],
  orders: [
    'order_number',
    'business_id',
    'customer_id',
    'customer_name',
    'items',
    'status',
  ],
  invoices: ['invoice_number', 'business_id', 'status'],
  appointments: [
    'short_id',
    'business_id',
    'created_by',
    'title',
    'start',
    'end',
    'status',
  ],
  email_changes: ['user_id', 'new_email', 'code', 'expires_at'],
  admins: ['short_id', 'name', 'email'],
  verification_codes: ['email', 'code', 'expires_at'],
  mails: ['short_id', 'to', 'from', 'subject', 'type', 'status'],
};

/** A human-readable reason if the row would violate a constraint, else null. */
function validateRow(coll: Coll, spec: RowSpec): string | null {
  const val = (col: string) => spec.values[spec.columns.indexOf(col)];
  for (const col of REQUIRED[coll]) {
    const v = val(col);
    if (v == null || v === '') return `missing required "${col}"`;
  }
  const enums = ENUMS[coll];
  if (enums) {
    for (const [col, allowed] of Object.entries(enums)) {
      const v = val(col);
      if (v != null && !allowed.includes(String(v))) {
        return `invalid ${col}="${String(v)}"`;
      }
    }
  }
  return null;
}

const transformers: Record<Coll, (d: any, newId: string) => RowSpec> = {
  businesses: (d, id) => ({
    columns: [
      'id', 'short_id', 'name', 'owner_id', 'categories', 'description',
      'tag_line', 'logo', 'logo_key', 'email', 'phone', 'website', 'address',
      'city', 'state', 'country', 'tax_id', 'registration_number',
      'business_hours', 'socials', 'is_active', 'created_at', 'updated_at',
    ],
    values: [
      id, d.shortId, d.name, remap('users', d.ownerId),
      j(d.categories ?? []), d.description ?? null, d.tagLine ?? null,
      d.logo ?? null, d.logoKey ?? null, d.email ?? null, d.phone ?? null,
      d.website ?? null, d.address ?? null, d.city ?? null, d.state ?? null,
      d.country ?? null, d.taxId ?? null, d.registrationNumber ?? null,
      d.businessHours != null ? j(d.businessHours) : null, j(d.socials ?? {}),
      d.isActive ?? true, reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),

  users: (d, id) => ({
    // No `role` column here -> DB default 'owner' applies (Mongo has no role).
    columns: [
      'id', 'short_id', 'first_name', 'last_name', 'email', 'google_id',
      'apple_id', 'password', 'hashed_refresh_token', 'avatar_url',
      'avatar_key', 'business_id', 'is_system', 'is_active',
      'is_email_verified', 'deleted', 'deleted_at', 'created_at', 'updated_at',
    ],
    values: [
      id, d.shortId, d.firstName, d.lastName ?? null, d.email,
      d.googleId ?? null, d.appleId ?? null, d.password ?? null,
      d.hashedRefreshToken ?? null, d.avatarUrl ?? null, d.avatarKey ?? null,
      remap('businesses', d.businessId, true), d.isSystem ?? false,
      d.isActive ?? true, d.isEmailVerified ?? false, d.deleted ?? false,
      asDate(d.deletedAt), reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),

  customers: (d, id) => ({
    columns: [
      'id', 'short_id', 'business_id', 'name', 'email', 'phone', 'notes',
      'created_at', 'updated_at',
    ],
    values: [
      id, d.shortId, remap('businesses', d.businessId), d.name,
      d.email ?? null, d.phone ?? null, d.notes ?? null,
      reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),

  resources: (d, id) => ({
    columns: [
      'id', 'short_id', 'business_id', 'type', 'name', 'price', 'primary_image',
      'primary_image_key', 'supporting_images', 'supporting_image_keys',
      'description', 'notes', 'available_quantity', 'low_stock_threshold',
      'business_hours', 'created_at', 'updated_at',
    ],
    values: [
      id, d.shortId, remap('businesses', d.businessId), d.type, d.name,
      d.price ?? 0, d.primaryImage ?? null, d.primaryImageKey ?? null,
      j(d.supportingImages ?? []), j(d.supportingImageKeys ?? []),
      d.description ?? null, d.notes ?? null, d.availableQuantity ?? 0,
      d.lowStockThreshold ?? 5,
      d.businessHours != null ? j(d.businessHours) : null,
      reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),

  orders: (d, id) => {
    const items = (d.items ?? []).map((it: any) => ({
      resourceId: remap('resources', it.resourceId),
      type: it.type,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      subTotal: it.subTotal,
    }));
    return {
      columns: [
        'id', 'order_number', 'business_id', 'customer_id', 'customer_name',
        'customer_email', 'customer_phone', 'items', 'total_amount', 'status',
        'invoice_id', 'created_at', 'updated_at',
      ],
      values: [
        id, d.orderNumber, remap('businesses', d.businessId),
        remap('customers', d.customerId), d.customerName,
        d.customerEmail ?? null, d.customerPhone ?? null, j(items),
        d.totalAmount ?? 0, d.status ?? 'pending',
        remap('invoices', d.invoiceId, true),
        reqDate(d.createdAt), reqDate(d.updatedAt),
      ],
    };
  },

  invoices: (d, id) => ({
    columns: [
      'id', 'invoice_number', 'business_id', 'order_ids', 'customer_id',
      'customer_name', 'customer_email', 'customer_phone', 'invoice_type',
      'subtotal', 'vat_rate', 'vat_amount', 'nhil_rate', 'nhil_amount',
      'getfund_rate', 'getfund_amount', 'total_tax', 'total_amount',
      'amount_paid', 'status', 'payment_method', 'payment_date', 'issue_date',
      'due_date', 'sent_at', 'notes', 'created_at', 'updated_at',
    ],
    values: [
      id, d.invoiceNumber, remap('businesses', d.businessId),
      j((d.orderIds ?? []).map((oid: unknown) => remap('orders', oid))),
      remap('customers', d.customerId, true), d.customerName ?? null,
      d.customerEmail ?? null, d.customerPhone ?? null,
      d.invoiceType ?? 'STANDARD', d.subtotal ?? 0, d.vatRate ?? 0.15,
      d.vatAmount ?? 0, d.nhilRate ?? 0.025, d.nhilAmount ?? 0,
      d.getfundRate ?? 0.025, d.getfundAmount ?? 0, d.totalTax ?? 0,
      d.totalAmount ?? 0, d.amountPaid ?? 0, d.status ?? 'DRAFT',
      d.paymentMethod ?? null, asDate(d.paymentDate), asDate(d.issueDate),
      asDate(d.dueDate), asDate(d.sentAt), d.notes ?? null,
      reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),

  appointments: (d, id) => {
    const invitees = (d.invitees ?? []).map((iv: any) => ({
      name: iv.name,
      email: iv.email ?? null,
      customerId: iv.customerId
        ? remap('customers', iv.customerId, true)
        : (iv.customerId ?? null),
    }));
    return {
      columns: [
        'id', 'short_id', 'business_id', 'created_by', 'title', 'start', 'end',
        'notes', 'location', 'invitees', 'recurrence', 'status', 'created_at',
        'updated_at',
      ],
      values: [
        id, d.shortId, remap('businesses', d.businessId),
        remap('users', d.createdBy), d.title, reqDate(d.start), reqDate(d.end),
        d.notes ?? null, d.location ?? null, j(invitees),
        d.recurrence != null ? j(d.recurrence) : null,
        d.status ?? 'scheduled', reqDate(d.createdAt), reqDate(d.updatedAt),
      ],
    };
  },

  email_changes: (d, id) => ({
    columns: ['id', 'user_id', 'new_email', 'code', 'expires_at', 'created_at'],
    values: [
      id, remap('users', d.userId), d.newEmail, d.code, reqDate(d.expiresAt),
      reqDate(d.createdAt),
    ],
  }),

  admins: (d, id) => ({
    columns: ['id', 'short_id', 'name', 'email', 'created_at', 'updated_at'],
    values: [
      id, d.shortId, d.name, d.email, reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),

  verification_codes: (d, id) => ({
    columns: ['id', 'email', 'code', 'expires_at', 'created_at', 'updated_at'],
    values: [
      id, d.email, d.code, reqDate(d.expiresAt),
      reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),

  mails: (d, id) => ({
    columns: [
      'id', 'short_id', 'to', 'from', 'subject', 'type', 'status',
      'provider_id', 'error', 'created_at', 'updated_at',
    ],
    values: [
      id, d.shortId, d.to, d.from, d.subject, d.type, d.status,
      d.providerId ?? null, d.error ?? null,
      reqDate(d.createdAt), reqDate(d.updatedAt),
    ],
  }),
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== Mongo -> Postgres data migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const mongo = new MongoClient(MONGODB_URI);
  const pg = new PgClient({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DBNAME,
    ssl: { rejectUnauthorized: false },
  });

  await mongo.connect();
  await pg.connect();
  const db = mongo.db();

  try {
    // ---- Pass 1: read every collection, assign uuids, build the id-map ----
    const docs: Record<Coll, any[]> = {} as any;
    for (const coll of LOAD_ORDER) {
      const raw = await db.collection(MONGO_COLLECTIONS[coll]).find({}).toArray();
      docs[coll] = raw;
      for (const d of raw) {
        const hex = toHex(d._id);
        if (hex) idMap[coll].set(hex, randomUUID());
      }
      console.log(`read ${String(raw.length).padStart(6)}  ${coll}`);
    }

    // ---- Transform + validate before any write. Rows that would violate a
    // NOT NULL / check constraint are quarantined so one bad legacy document
    // can't abort the entire atomic load. ----
    const rows: Record<Coll, RowSpec[]> = {} as any;
    const invalid: { coll: Coll; id: string; reason: string }[] = [];
    for (const coll of LOAD_ORDER) {
      const valid: RowSpec[] = [];
      for (const d of docs[coll]) {
        const mongoHex = toHex(d._id)!;
        const spec = transformers[coll](d, idMap[coll].get(mongoHex)!);
        const reason = validateRow(coll, spec);
        if (reason) {
          invalid.push({ coll, id: mongoHex, reason });
          continue;
        }
        valid.push(spec);
      }
      rows[coll] = valid;
    }

    console.log(
      `\ndangling references: ${danglingCount}` +
        (danglingSamples.length ? ` (e.g. ${danglingSamples.join(', ')})` : ''),
    );

    if (invalid.length > 0) {
      console.log(`\n⚠ ${invalid.length} row(s) skipped (constraint issues):`);
      for (const r of invalid.slice(0, 50)) {
        console.log(`  ${r.coll} ${r.id}: ${r.reason}`);
      }
      if (invalid.length > 50) {
        console.log(`  ...and ${invalid.length - 50} more`);
      }
    }

    if (DRY_RUN) {
      console.log('\nDRY RUN — no data written. Row counts to insert:');
      for (const coll of LOAD_ORDER) console.log(`  ${coll}: ${rows[coll].length}`);
      return;
    }

    // ---- Pass 2: truncate + insert inside one transaction ----
    await pg.query('BEGIN');
    const tables = LOAD_ORDER.map((c) => `"${c}"`).join(', ');
    console.log(`\ntruncating: ${tables}`);
    await pg.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);

    for (const coll of LOAD_ORDER) {
      const specs = rows[coll];
      let inserted = 0;
      for (const spec of specs) {
        const placeholders = spec.columns.map((_, i) => `$${i + 1}`).join(', ');
        const colList = spec.columns.map((c) => `"${c}"`).join(', ');
        await pg.query(
          `INSERT INTO "${coll}" (${colList}) VALUES (${placeholders})`,
          spec.values,
        );
        inserted++;
      }
      console.log(`inserted ${String(inserted).padStart(6)}  ${coll}`);
    }

    await pg.query('COMMIT');
    console.log('\n✅ COMMIT — migration complete.');
  } catch (err) {
    if (!DRY_RUN) {
      try {
        await pg.query('ROLLBACK');
        console.error('\n⛔ ROLLBACK — no changes were committed.');
      } catch {
        /* ignore rollback errors */
      }
    }
    throw err;
  } finally {
    await mongo.close();
    await pg.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});

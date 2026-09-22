/**
 * Seed two isolated, same-level (owner) test tenants for cross-account /
 * escalation (IDOR) testing. Each tenant gets a user (with a known password),
 * a business, and a spread of customers, resources, orders and one invoice —
 * so you can sign in as A and try to reach B's records by id.
 *
 * Idempotent: re-running wipes the two test tenants (by email) first.
 *
 * Connection comes from the environment (PG_URI, or PG_HOST/PG_USER/
 * PG_PASSWORD/PG_DBNAME). Run:  pnpm seed:test
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import * as argon2 from 'argon2'
import { nanoid } from 'nanoid/non-secure'
import { Client, type ClientConfig } from 'pg'

const PASSWORD = 'Testpass!2345' // >= 12 chars (matches the API rule)

const TENANTS = [
  { firstName: 'Alice', lastName: 'Merchant', email: 'alice.qa@ventura.test', business: 'Alice Coffee Co.' },
  { firstName: 'Bob', lastName: 'Trader', email: 'bob.qa@ventura.test', business: 'Bob Hardware Ltd.' },
]

function pgConfig(): ClientConfig {
  const ssl = { rejectUnauthorized: false }
  const uri = process.env.PG_URI
  if (uri) return { connectionString: uri, ssl }
  const raw = process.env.PG_HOST ?? 'localhost'
  const { host, port } = raw.includes('://')
    ? (() => {
        const u = new URL(raw)
        return { host: u.hostname, port: u.port ? Number(u.port) : 5432 }
      })()
    : (() => {
        const [h, p] = raw.split(':')
        return { host: h, port: p ? Number(p) : 5432 }
      })()
  return {
    host,
    port,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DBNAME,
    ssl,
  }
}

const now = () => new Date()
const money = (n: number) => Math.round(n * 100) / 100

/** Remove any prior test tenant for this email (business-scoped data first). */
async function wipe(db: Client, email: string): Promise<void> {
  const { rows } = await db.query<{ id: string; business_id: string | null }>(
    'select id, business_id from users where email = $1',
    [email],
  )
  for (const u of rows) {
    if (u.business_id) {
      for (const table of [
        'invoices',
        'orders',
        'stock_adjustments',
        'resources',
        'customers',
      ]) {
        await db.query(`delete from "${table}" where business_id = $1`, [
          u.business_id,
        ])
      }
      await db.query('delete from businesses where id = $1', [u.business_id])
    }
    await db.query('delete from users where id = $1', [u.id])
  }
}

async function insert(
  db: Client,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const cols = Object.keys(row)
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  const colList = cols.map((c) => `"${c}"`).join(', ')
  await db.query(
    `insert into "${table}" (${colList}) values (${placeholders})`,
    Object.values(row),
  )
}

interface Seeded {
  email: string
  password: string
  userId: string
  businessId: string
  customerIds: string[]
  resourceIds: string[]
  orderIds: string[]
  invoiceId: string
}

async function seedTenant(
  db: Client,
  t: (typeof TENANTS)[number],
): Promise<Seeded> {
  const ts = now()
  const userId = randomUUID()
  const businessId = randomUUID()
  const passwordHash = await argon2.hash(PASSWORD)

  await insert(db, 'users', {
    id: userId,
    short_id: nanoid(8),
    role: 'owner',
    first_name: t.firstName,
    last_name: t.lastName,
    email: t.email,
    password: passwordHash,
    business_id: businessId,
    is_system: false,
    is_active: true,
    is_email_verified: true,
    deleted: false,
    created_at: ts,
    updated_at: ts,
  })

  await insert(db, 'businesses', {
    id: businessId,
    short_id: nanoid(8),
    name: t.business,
    owner_id: userId,
    categories: JSON.stringify(['Retail']),
    email: t.email,
    phone: '+233200000000',
    city: 'Accra',
    country: 'Ghana',
    socials: JSON.stringify({}),
    is_active: true,
    created_at: ts,
    updated_at: ts,
  })

  // Customers
  const customerDefs = [
    { name: 'Kofi Mensah', email: 'kofi@example.com', phone: '+233201111111' },
    { name: 'Ama Owusu', email: 'ama@example.com', phone: '+233202222222' },
    { name: 'Yaw Boateng', email: 'yaw@example.com', phone: '+233203333333' },
  ]
  const customerIds: string[] = []
  for (const c of customerDefs) {
    const id = randomUUID()
    customerIds.push(id)
    await insert(db, 'customers', {
      id,
      short_id: nanoid(8),
      business_id: businessId,
      name: `${c.name} (${t.firstName})`,
      email: c.email,
      phone: c.phone,
      created_at: ts,
      updated_at: ts,
    })
  }

  // Resources: 2 products (one with bulk units) + 1 service
  const resourceDefs = [
    {
      type: 'product',
      name: 'Bag of Beans',
      price: 12.5,
      qty: 80,
      baseUnit: 'bag',
      units: [{ name: 'case', factor: 12, price: 140 }],
    },
    {
      type: 'product',
      name: 'Ceramic Mug',
      price: 8,
      qty: 200,
      baseUnit: 'piece',
      units: [] as unknown[],
    },
    {
      type: 'service',
      name: 'Barista Training',
      price: 250,
      qty: 0,
      baseUnit: null as string | null,
      units: [] as unknown[],
    },
  ]
  const resourceIds: string[] = []
  for (const r of resourceDefs) {
    const id = randomUUID()
    resourceIds.push(id)
    await insert(db, 'resources', {
      id,
      short_id: nanoid(8),
      business_id: businessId,
      type: r.type,
      name: `${r.name} (${t.firstName})`,
      price: r.price,
      supporting_images: JSON.stringify([]),
      supporting_image_keys: JSON.stringify([]),
      available_quantity: r.qty,
      low_stock_threshold: 5,
      base_unit: r.baseUnit,
      units: JSON.stringify(r.units),
      created_at: ts,
      updated_at: ts,
    })
  }

  // Orders: two, each snapshotting a couple of line items.
  const orderIds: string[] = []
  const orderPlans = [
    { customer: 0, lines: [{ res: 0, qty: 2 }, { res: 1, qty: 3 }] },
    { customer: 1, lines: [{ res: 2, qty: 1 }] },
  ]
  for (const plan of orderPlans) {
    const id = randomUUID()
    orderIds.push(id)
    const items = plan.lines.map((l) => {
      const def = resourceDefs[l.res]
      const subTotal = money(def.price * l.qty)
      return {
        resourceId: resourceIds[l.res],
        type: def.type,
        name: `${def.name} (${t.firstName})`,
        price: def.price,
        quantity: l.qty,
        unit: def.baseUnit ?? 'unit',
        unitFactor: 1,
        subTotal,
      }
    })
    const totalAmount = money(items.reduce((s, i) => s + i.subTotal, 0))
    const cust = customerDefs[plan.customer]
    await insert(db, 'orders', {
      id,
      order_number: `ORD-${nanoid(10)}`,
      business_id: businessId,
      customer_id: customerIds[plan.customer],
      customer_name: `${cust.name} (${t.firstName})`,
      customer_email: cust.email,
      customer_phone: cust.phone,
      items: JSON.stringify(items),
      total_amount: totalAmount,
      status: 'completed',
      created_at: ts,
      updated_at: ts,
    })
  }

  // One invoice from the first order (Ghana VAT breakdown).
  const firstOrderSubtotal = money(
    resourceDefs[0].price * 2 + resourceDefs[1].price * 3,
  )
  const nhil = money(firstOrderSubtotal * 0.025)
  const getfund = money(firstOrderSubtotal * 0.025)
  const vat = money((firstOrderSubtotal + nhil + getfund) * 0.15)
  const totalTax = money(vat + nhil + getfund)
  const invoiceTotal = money(firstOrderSubtotal + totalTax)
  const invoiceId = randomUUID()
  const cust0 = customerDefs[0]
  await insert(db, 'invoices', {
    id: invoiceId,
    invoice_number: `INV-${nanoid(10)}`,
    business_id: businessId,
    order_ids: JSON.stringify([orderIds[0]]),
    customer_id: customerIds[0],
    customer_name: `${cust0.name} (${t.firstName})`,
    customer_email: cust0.email,
    invoice_type: 'STANDARD',
    subtotal: firstOrderSubtotal,
    vat_rate: 0.15,
    vat_amount: vat,
    nhil_rate: 0.025,
    nhil_amount: nhil,
    getfund_rate: 0.025,
    getfund_amount: getfund,
    total_tax: totalTax,
    total_amount: invoiceTotal,
    amount_paid: 0,
    status: 'SENT',
    issue_date: ts,
    created_at: ts,
    updated_at: ts,
  })
  // Link the order back to its invoice.
  await db.query('update orders set invoice_id = $1 where id = $2', [
    invoiceId,
    orderIds[0],
  ])

  return {
    email: t.email,
    password: PASSWORD,
    userId,
    businessId,
    customerIds,
    resourceIds,
    orderIds,
    invoiceId,
  }
}

async function main(): Promise<void> {
  const db = new Client(pgConfig())
  await db.connect()
  try {
    const results: Seeded[] = []
    for (const t of TENANTS) {
      await wipe(db, t.email)
      results.push(await seedTenant(db, t))
    }

    console.log('\n=== Seeded test tenants (password for both: ' + PASSWORD + ') ===')
    for (const r of results) {
      console.log(`\n${r.email}`)
      console.log(`  userId      ${r.userId}`)
      console.log(`  businessId  ${r.businessId}`)
      console.log(`  customers   ${r.customerIds.join(', ')}`)
      console.log(`  resources   ${r.resourceIds.join(', ')}`)
      console.log(`  orders      ${r.orderIds.join(', ')}`)
      console.log(`  invoice     ${r.invoiceId}`)
    }
    console.log(
      '\nSign in via POST /auth/sign-in-password with each email + the password above,',
    )
    console.log(
      "then use one account's token against the other's ids to test isolation.",
    )
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('\nSeeding failed:', err)
  process.exit(1)
})

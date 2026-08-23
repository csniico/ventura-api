import { defineEntity, InferEntity } from '@mikro-orm/core'
import { nanoid } from 'nanoid/non-secure'
import { InvoiceStatus, InvoiceType, PaymentMethod } from './invoice.entity'

/** Generate a unique invoice number: VEN-<yymmddHHMMSSmmm>-<rand>. */
function generateInvoiceNumber(): string {
  const now = new Date()
  const p = (n: number, len = 2) => n.toString().padStart(len, '0')
  const ts =
    `${now.getFullYear().toString().slice(-2)}${p(now.getMonth() + 1)}` +
    `${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}` +
    `${p(now.getSeconds())}${p(now.getMilliseconds(), 3)}`
  return `VEN-${ts}-${nanoid(6).toUpperCase()}`
}

/**
 * Postgres mapping for an invoice (MikroORM v7 schema-first `defineEntity`).
 * Column set mirrors the legacy Mongoose `Invoice` schema. `orderIds` is `jsonb`;
 * money fields are doubles (matching Mongo's Number). `businessId` / `customerId`
 * are indexed.
 */
export const PostgresInvoiceEntity = defineEntity({
  name: 'PostgresInvoiceEntity',
  tableName: 'invoices',
  indexes: [{ properties: ['businessId'] }, { properties: ['customerId'] }],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    invoiceNumber: p
      .string()
      .unique()
      .onCreate(() => generateInvoiceNumber()),
    businessId: p.string(),
    orderIds: p.json<string[]>().defaultRaw(`'[]'`),
    customerId: p.string().nullable(),
    customerName: p.string().nullable(),
    customerEmail: p.string().nullable(),
    customerPhone: p.string().nullable(),
    invoiceType: p.enum(() => InvoiceType).default(InvoiceType.STANDARD),
    subtotal: p.double(),
    vatRate: p.double().default(0.15),
    vatAmount: p.double(),
    nhilRate: p.double().default(0.025),
    nhilAmount: p.double(),
    getfundRate: p.double().default(0.025),
    getfundAmount: p.double(),
    totalTax: p.double(),
    totalAmount: p.double(),
    amountPaid: p.double().default(0),
    status: p.enum(() => InvoiceStatus).default(InvoiceStatus.DRAFT),
    paymentMethod: p.enum(() => PaymentMethod).nullable(),
    paymentDate: p.datetime().nullable(),
    issueDate: p.datetime().nullable(),
    dueDate: p.datetime().nullable(),
    sentAt: p.datetime().nullable(),
    notes: p.string().nullable(),
    createdAt: p
      .datetime()
      .defaultRaw('now()')
      .onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .defaultRaw('now()')
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  }),
})

export type PostgresInvoice = InferEntity<typeof PostgresInvoiceEntity>

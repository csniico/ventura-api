import { defineEntity, InferEntity } from '@mikro-orm/core';
import { nanoid } from 'nanoid/non-secure';
import { OrderItemSnapshot, OrderStatus } from './order.entity';

/**
 * Postgres mapping for an order (MikroORM v7 schema-first `defineEntity`).
 * Column set mirrors the legacy Mongoose `Order` schema. Line items are stored
 * as `jsonb` (an array of snapshots). `businessId` / `customerId` / `invoiceId`
 * are indexed for scoped listing and invoice linking. `totalAmount` is a double,
 * matching Mongo's Number.
 */
export const PostgresOrderEntity = defineEntity({
  name: 'PostgresOrderEntity',
  tableName: 'orders',
  indexes: [
    { properties: ['businessId'] },
    { properties: ['customerId'] },
    { properties: ['invoiceId'] },
  ],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    orderNumber: p
      .string()
      .unique()
      .onCreate(() => `ORD-${nanoid(8).toUpperCase()}`),
    businessId: p.string(),
    customerId: p.string(),
    customerName: p.string(),
    customerEmail: p.string().nullable(),
    customerPhone: p.string().nullable(),
    items: p.json<OrderItemSnapshot[]>(),
    totalAmount: p.double().default(0),
    status: p.enum(() => OrderStatus).default(OrderStatus.PENDING),
    invoiceId: p.string().nullable(),
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
});

export type PostgresOrder = InferEntity<typeof PostgresOrderEntity>;

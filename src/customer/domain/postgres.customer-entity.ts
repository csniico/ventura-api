import { defineEntity, InferEntity } from '@mikro-orm/core';
import { nanoid } from 'nanoid/non-secure';

/**
 * Postgres mapping for a customer (MikroORM v7 schema-first `defineEntity`).
 * Column set mirrors the legacy Mongoose `Customer` schema. `businessId` is a
 * plain `business.id` string, indexed for per-business listing and duplicate
 * checks (shared-schema tenancy).
 */
export const PostgresCustomerEntity = defineEntity({
  name: 'PostgresCustomerEntity',
  tableName: 'customers',
  indexes: [{ properties: ['businessId'] }],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    shortId: p
      .string()
      .unique()
      .onCreate(() => nanoid(8)),
    businessId: p.string(),
    name: p.string(),
    email: p.string().nullable(),
    phone: p.string().nullable(),
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
});

export type PostgresCustomer = InferEntity<typeof PostgresCustomerEntity>;

import { defineEntity, InferEntity } from '@mikro-orm/core';
import { nanoid } from 'nanoid/non-secure';
import { BusinessHours, ResourceType } from './resource.entity';

/**
 * Postgres mapping for a resource (MikroORM v7 schema-first `defineEntity`).
 * Column set mirrors the legacy Mongoose `Resource` schema. `businessId` and
 * `type` are indexed for scoped listing/filtering. `price` is a double, matching
 * Mongo's Number (both are IEEE-754, so values round-trip identically).
 */
export const PostgresResourceEntity = defineEntity({
  name: 'PostgresResourceEntity',
  tableName: 'resources',
  indexes: [{ properties: ['businessId'] }, { properties: ['type'] }],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    shortId: p
      .string()
      .unique()
      .onCreate(() => nanoid(8)),
    businessId: p.string(),
    type: p.enum(() => ResourceType),
    name: p.string(),
    price: p.double(),
    primaryImage: p.string().nullable(),
    primaryImageKey: p.string().nullable(),
    supportingImages: p.json<string[]>().defaultRaw(`'[]'`),
    supportingImageKeys: p.json<string[]>().defaultRaw(`'[]'`),
    description: p.string().nullable(),
    notes: p.string().nullable(),
    availableQuantity: p.integer().default(0),
    lowStockThreshold: p.integer().default(5),
    businessHours: p.json<BusinessHours>().nullable(),
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

export type PostgresResource = InferEntity<typeof PostgresResourceEntity>;

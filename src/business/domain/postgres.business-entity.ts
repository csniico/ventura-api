import { defineEntity, InferEntity } from '@mikro-orm/core';
import { nanoid } from 'nanoid/non-secure';
import { BusinessHours, Socials } from './business.entity';

/**
 * Postgres mapping for a business (MikroORM v7 schema-first `defineEntity`).
 * Column set mirrors the legacy Mongoose `Business` schema so the API returns
 * identical payloads. `ownerId` is a plain `user.id` string; it is indexed for
 * the `getByOwner` lookup but not unique (one-business-per-owner is enforced on
 * the user side via `setBusinessId`).
 */
export const PostgresBusinessEntity = defineEntity({
  name: 'PostgresBusinessEntity',
  tableName: 'businesses',
  indexes: [{ properties: ['ownerId'] }],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    shortId: p
      .string()
      .unique()
      .onCreate(() => nanoid(8)),
    name: p.string(),
    ownerId: p.string(),
    categories: p.json<string[]>().defaultRaw(`'[]'`),
    description: p.string().nullable(),
    tagLine: p.string().nullable(),
    logo: p.string().nullable(),
    logoKey: p.string().nullable(),
    email: p.string().nullable(),
    phone: p.string().nullable(),
    website: p.string().nullable(),
    address: p.string().nullable(),
    city: p.string().nullable(),
    state: p.string().nullable(),
    country: p.string().nullable(),
    taxId: p.string().nullable(),
    registrationNumber: p.string().nullable(),
    businessHours: p.json<BusinessHours>().nullable(),
    socials: p.json<Socials>().defaultRaw(`'{}'`),
    isActive: p.boolean().default(true),
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

export type PostgresBusiness = InferEntity<typeof PostgresBusinessEntity>;

import { defineEntity, InferEntity } from '@mikro-orm/core';
import { nanoid } from 'nanoid/non-secure';

/**
 * Postgres mapping for a platform admin (MikroORM v7 schema-first
 * `defineEntity`). Column set mirrors the legacy Mongoose `Admin` schema.
 * `email` is unique (idempotent create keys on it).
 */
export const PostgresAdminEntity = defineEntity({
  name: 'PostgresAdminEntity',
  tableName: 'admins',
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    shortId: p
      .string()
      .unique()
      .onCreate(() => nanoid(8)),
    name: p.string(),
    email: p.string().unique(),
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

export type PostgresAdmin = InferEntity<typeof PostgresAdminEntity>;

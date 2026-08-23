import { defineEntity, InferEntity } from '@mikro-orm/core'
import { nanoid } from 'nanoid/non-secure'
import { UserRole } from './user.entity'

/**
 * Postgres mapping for a user (MikroORM v7 schema-first `defineEntity`).
 * Column set mirrors the legacy Mongoose `User` schema so the v2 API can return
 * identical payloads. `googleId` / `appleId` are unique + nullable (Postgres
 * allows many NULLs under a unique index, matching Mongo's sparse-unique).
 */
export const PostgresUserEntity = defineEntity({
  name: 'PostgresUserEntity',
  tableName: 'users',
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    shortId: p
      .string()
      .unique()
      .onCreate(() => nanoid(8)),
    role: p.enum(() => UserRole).default(UserRole.OWNER),
    firstName: p.string(),
    lastName: p.string().nullable(),
    email: p.string().unique(),
    googleId: p.string().nullable().unique(),
    appleId: p.string().nullable().unique(),
    password: p.string().nullable(),
    hashedRefreshToken: p.string().nullable(),
    avatarUrl: p.string().nullable(),
    avatarKey: p.string().nullable(),
    businessId: p.string().nullable(),
    isSystem: p.boolean().default(false),
    isActive: p.boolean().default(true),
    isEmailVerified: p.boolean().default(false),
    deleted: p.boolean().default(false),
    deletedAt: p.datetime().nullable(),
    // DB default `now()` keeps non-ORM inserts and migration backfills valid;
    // the ORM still stamps managed writes via onCreate/onUpdate.
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

export type PostgresUser = InferEntity<typeof PostgresUserEntity>

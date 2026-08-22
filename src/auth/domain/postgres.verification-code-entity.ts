import { defineEntity, InferEntity } from '@mikro-orm/core';

/**
 * Postgres mapping for a passwordless sign-in code (MikroORM v7 schema-first
 * `defineEntity`). Column set mirrors the legacy Mongoose `VerificationCode`
 * schema. `email` is indexed for the per-email lookup/replace. Mongo's TTL
 * index has no Postgres equivalent; expiry is enforced in the service and the
 * per-email replace + consume-on-verify keep the table bounded.
 */
export const PostgresVerificationCodeEntity = defineEntity({
  name: 'PostgresVerificationCodeEntity',
  tableName: 'verification_codes',
  indexes: [{ properties: ['email'] }],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    email: p.string(),
    code: p.string(),
    expiresAt: p.datetime(),
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

export type PostgresVerificationCode = InferEntity<
  typeof PostgresVerificationCodeEntity
>;

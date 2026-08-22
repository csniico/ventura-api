import { defineEntity, InferEntity } from '@mikro-orm/core';

/**
 * A short-lived pending email-change request. Mirrors the legacy Mongoose
 * `EmailChange` collection: the user confirms the new address by entering the
 * emailed code before `expiresAt`. Unlike Mongo (which auto-removes via a TTL
 * index), expired rows are pruned lazily — every write for a user replaces any
 * prior pending change, and reads filter on `expiresAt > now`.
 */
export const PostgresEmailChangeEntity = defineEntity({
  name: 'PostgresEmailChangeEntity',
  tableName: 'email_changes',
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    userId: p.string(),
    newEmail: p.string(),
    // 6-digit numeric code stored as a string to preserve leading zeros.
    code: p.string(),
    expiresAt: p.datetime(),
    createdAt: p.datetime().onCreate(() => new Date()),
  }),
});

export type PostgresEmailChange = InferEntity<typeof PostgresEmailChangeEntity>;

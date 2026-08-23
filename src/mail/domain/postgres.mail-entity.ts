import { defineEntity, InferEntity } from '@mikro-orm/core'
import { nanoid } from 'nanoid/non-secure'
import { MailStatus, MailType } from './mail.entity'

/**
 * Postgres mapping for a mail-send audit record (MikroORM v7 schema-first
 * `defineEntity`). Column set mirrors the legacy Mongoose `Mail` schema. `type`
 * and `status` become text + check constraints.
 */
export const PostgresMailEntity = defineEntity({
  name: 'PostgresMailEntity',
  tableName: 'mails',
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    shortId: p
      .string()
      .unique()
      .onCreate(() => nanoid(8)),
    to: p.string(),
    from: p.string(),
    subject: p.string(),
    type: p.enum(() => MailType),
    status: p.enum(() => MailStatus),
    providerId: p.string().nullable(),
    error: p.string().nullable(),
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

export type PostgresMail = InferEntity<typeof PostgresMailEntity>

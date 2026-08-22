import { defineEntity, InferEntity } from '@mikro-orm/core';
import { nanoid } from 'nanoid/non-secure';
import { AppointmentStatus, Invitee, Recurrence } from './appointment.entity';

/**
 * Postgres mapping for an appointment (MikroORM v7 schema-first `defineEntity`).
 * Column set mirrors the legacy Mongoose `Appointment` schema. `invitees` and
 * `recurrence` are embedded as `jsonb`. `businessId` is indexed for scoped
 * listing/search.
 */
export const PostgresAppointmentEntity = defineEntity({
  name: 'PostgresAppointmentEntity',
  tableName: 'appointments',
  indexes: [{ properties: ['businessId'] }],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    shortId: p
      .string()
      .unique()
      .onCreate(() => nanoid(8)),
    businessId: p.string(),
    createdBy: p.string(),
    title: p.string(),
    start: p.datetime(),
    end: p.datetime(),
    notes: p.string().nullable(),
    location: p.string().nullable(),
    invitees: p.json<Invitee[]>().defaultRaw(`'[]'`),
    recurrence: p.json<Recurrence>().nullable(),
    status: p
      .enum(() => AppointmentStatus)
      .default(AppointmentStatus.SCHEDULED),
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

export type PostgresAppointment = InferEntity<typeof PostgresAppointmentEntity>;

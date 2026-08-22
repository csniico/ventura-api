import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { FilterQuery } from '@mikro-orm/core';
import { IAppointment, Recurrence } from '../domain/appointment.entity';
import {
  AppointmentRepository,
  ICreateAppointment,
  IUpdateAppointment,
} from '../domain/appointment.repository';
import {
  PostgresAppointment,
  PostgresAppointmentEntity,
} from '../domain/postgres.appointment-entity';

/** Escape LIKE/ILIKE wildcards so a raw search term matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

@Injectable()
export class PostgresAppointmentRepository implements AppointmentRepository {
  constructor(private readonly em: EntityManager) {}

  /** Recurrence is stored as jsonb, so `until` comes back as a string. */
  private toRecurrence(
    recurrence: Recurrence | null | undefined,
  ): Recurrence | null {
    if (!recurrence) return null;
    return {
      frequency: recurrence.frequency,
      interval: recurrence.interval,
      until: recurrence.until ? new Date(recurrence.until) : null,
    };
  }

  private toDomain(entity: PostgresAppointment): IAppointment {
    return {
      id: entity.id,
      shortId: entity.shortId,
      businessId: entity.businessId,
      createdBy: entity.createdBy,
      title: entity.title,
      start: entity.start,
      end: entity.end,
      notes: entity.notes,
      location: entity.location,
      invitees: entity.invitees,
      recurrence: this.toRecurrence(entity.recurrence),
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async create(data: ICreateAppointment): Promise<IAppointment> {
    const appointment = this.em.create(PostgresAppointmentEntity, data);
    await this.em.flush();
    return this.toDomain(appointment);
  }

  async findById(businessId: string, id: string): Promise<IAppointment | null> {
    const appointment = await this.em.findOne(PostgresAppointmentEntity, {
      id,
      businessId,
    });
    return appointment ? this.toDomain(appointment) : null;
  }

  async list(
    businessId: string,
    from?: Date,
    to?: Date,
  ): Promise<IAppointment[]> {
    const where: FilterQuery<PostgresAppointment> = { businessId };
    if (from || to) {
      where.start = {};
      if (from) where.start.$gte = from;
      if (to) where.start.$lte = to;
    }
    const rows = await this.em.find(PostgresAppointmentEntity, where, {
      orderBy: { start: 'ASC' },
    });
    return rows.map((a) => this.toDomain(a));
  }

  async search(
    businessId: string,
    q: string,
    limit: number,
  ): Promise<IAppointment[]> {
    const rows = await this.em.find(
      PostgresAppointmentEntity,
      { businessId, title: { $ilike: `%${escapeLike(q)}%` } },
      { orderBy: { start: 'ASC' }, limit },
    );
    return rows.map((a) => this.toDomain(a));
  }

  async update(
    businessId: string,
    id: string,
    patch: IUpdateAppointment,
  ): Promise<IAppointment | null> {
    const appointment = await this.em.findOne(PostgresAppointmentEntity, {
      id,
      businessId,
    });
    if (!appointment) {
      return null;
    }
    // Drop undefined keys (present-only writes); an explicit null clears.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    this.em.assign(appointment, clean);
    await this.em.flush();
    return this.toDomain(appointment);
  }

  async delete(businessId: string, id: string): Promise<IAppointment | null> {
    const appointment = await this.em.findOne(PostgresAppointmentEntity, {
      id,
      businessId,
    });
    if (!appointment) {
      return null;
    }
    const removed = this.toDomain(appointment);
    await this.em.nativeDelete(PostgresAppointmentEntity, { id, businessId });
    return removed;
  }
}

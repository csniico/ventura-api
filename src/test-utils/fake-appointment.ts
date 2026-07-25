import { nanoid } from 'nanoid/non-secure';
import type { Provider } from '@nestjs/common';
import {
  AppointmentStatus,
  IAppointment,
} from '../appointment/domain/appointment.entity';
import {
  APPOINTMENT_DATA_SOURCE,
  AppointmentRepository,
  ICreateAppointment,
  IUpdateAppointment,
} from '../appointment/domain/appointment.repository';
import { AppointmentService } from '../appointment/application/appointment.service';

/**
 * In-memory `AppointmentRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics, business-scoped queries, soonest-first ordering, and
 * the title search.
 */
export class FakeAppointmentRepository implements AppointmentRepository {
  private readonly rows = new Map<string, IAppointment>();
  private seq = 0;

  create(data: ICreateAppointment): Promise<IAppointment> {
    const now = new Date();
    const appointment: IAppointment = {
      id: `60000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      shortId: nanoid(8),
      businessId: data.businessId,
      createdBy: data.createdBy,
      title: data.title,
      start: data.start,
      end: data.end,
      notes: data.notes ?? null,
      location: data.location ?? null,
      invitees: data.invitees,
      recurrence: data.recurrence ?? null,
      status: AppointmentStatus.SCHEDULED,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(appointment.id, appointment);
    return Promise.resolve({ ...appointment });
  }
  findById(businessId: string, id: string): Promise<IAppointment | null> {
    const a = this.rows.get(id);
    return Promise.resolve(a && a.businessId === businessId ? { ...a } : null);
  }
  list(businessId: string, from?: Date, to?: Date): Promise<IAppointment[]> {
    const rows = [...this.rows.values()]
      .filter((a) => a.businessId === businessId)
      .filter((a) => !from || a.start >= from)
      .filter((a) => !to || a.start <= to)
      .sort((x, y) => x.start.getTime() - y.start.getTime()) // soonest first
      .map((a) => ({ ...a }));
    return Promise.resolve(rows);
  }
  search(
    businessId: string,
    q: string,
    limit: number,
  ): Promise<IAppointment[]> {
    const needle = q.toLowerCase();
    const rows = [...this.rows.values()]
      .filter(
        (a) =>
          a.businessId === businessId && a.title.toLowerCase().includes(needle),
      )
      .sort((x, y) => x.start.getTime() - y.start.getTime())
      .slice(0, limit)
      .map((a) => ({ ...a }));
    return Promise.resolve(rows);
  }
  update(
    businessId: string,
    id: string,
    patch: IUpdateAppointment,
  ): Promise<IAppointment | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null);
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    const merged = { ...existing, ...clean, updatedAt: new Date() };
    this.rows.set(id, merged);
    return Promise.resolve({ ...merged });
  }
  delete(businessId: string, id: string): Promise<IAppointment | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null);
    }
    this.rows.delete(id);
    return Promise.resolve({ ...existing });
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear();
    this.seq = 0;
  }
  _get(id: string): IAppointment | undefined {
    return this.rows.get(id);
  }
  _count(): number {
    return this.rows.size;
  }
}

/**
 * Providers for a fake-backed `AppointmentService` plus a handle to the fake
 * store. The consuming module must also provide `CustomerService` (the service
 * validates invitees against it).
 */
export function fakeAppointmentServiceProviders(): {
  providers: Provider[];
  appointments: FakeAppointmentRepository;
} {
  const appointments = new FakeAppointmentRepository();
  return {
    appointments,
    providers: [
      AppointmentService,
      { provide: APPOINTMENT_DATA_SOURCE, useValue: appointments },
    ],
  };
}

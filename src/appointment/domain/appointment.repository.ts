import {
  AppointmentStatus,
  IAppointment,
  Invitee,
  Recurrence,
} from './appointment.entity';

/** Fields accepted when creating an appointment (scoped to a business). */
export interface ICreateAppointment {
  businessId: string;
  createdBy: string;
  title: string;
  start: Date;
  end: Date;
  notes?: string | null;
  location?: string | null;
  invitees: Invitee[];
  recurrence?: Recurrence | null;
}

/** Partial patch applied to an existing appointment. Only present keys written. */
export interface IUpdateAppointment {
  title?: string;
  notes?: string | null;
  location?: string | null;
  start?: Date;
  end?: Date;
  invitees?: Invitee[];
  recurrence?: Recurrence | null;
  status?: AppointmentStatus;
}

/**
 * Data-access boundary for appointments. Every read/write is scoped by
 * `businessId`. Business rules (range validation, invitee validation,
 * recurrence mapping) live in the service.
 */
export interface AppointmentRepository {
  create(data: ICreateAppointment): Promise<IAppointment>;
  findById(businessId: string, id: string): Promise<IAppointment | null>;
  /** A business's appointments, soonest first; optional start-date window. */
  list(businessId: string, from?: Date, to?: Date): Promise<IAppointment[]>;
  /** Title search (case-insensitive), soonest first, capped at `limit`. */
  search(businessId: string, q: string, limit: number): Promise<IAppointment[]>;
  update(
    businessId: string,
    id: string,
    patch: IUpdateAppointment,
  ): Promise<IAppointment | null>;
  delete(businessId: string, id: string): Promise<IAppointment | null>;
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const APPOINTMENT_DATA_SOURCE = Symbol('APPOINTMENT_DATA_SOURCE');

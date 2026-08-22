export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/** Lifecycle state of an appointment. */
export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  ATTENDED = 'attended',
  CANCELLED = 'cancelled',
}

/** Someone invited: either a linked customer (customerId) or an ad-hoc email. */
export interface Invitee {
  name: string;
  email?: string | null;
  customerId?: string | null;
}

/** Recurrence rule: repeat every `interval` `frequency` units until `until`. */
export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  until?: Date | null;
}

/**
 * Domain contract for an appointment. Mirrors the public `AppointmentResponse`.
 * `businessId` scopes every read/write; `createdBy` is the user id. Invitees and
 * the recurrence rule are embedded (stored as jsonb).
 */
export interface IAppointment {
  id: string;
  shortId: string;
  businessId: string;
  createdBy: string;
  title: string;
  start: Date;
  end: Date;
  notes?: string | null;
  location?: string | null;
  invitees: Invitee[];
  recurrence?: Recurrence | null;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

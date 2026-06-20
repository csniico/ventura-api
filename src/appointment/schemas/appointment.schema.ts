import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

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
@Schema({ _id: false })
export class Invitee {
  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, default: null })
  email?: string;

  // Set when the invitee is a known customer (plain string id, no populate).
  @Prop({ type: String, default: null })
  customerId?: string;
}
const InviteeSchema = SchemaFactory.createForClass(Invitee);

/** Recurrence rule: repeat every `interval` `frequency` units until `until`. */
@Schema({ _id: false })
export class Recurrence {
  @Prop({ type: String, enum: RecurrenceFrequency, required: true })
  frequency!: RecurrenceFrequency;

  @Prop({ type: Number, default: 1, min: 1 })
  interval!: number;

  // Optional last date an occurrence may fall on (inclusive).
  @Prop({ type: Date, default: null })
  until?: Date | null;
}
const RecurrenceSchema = SchemaFactory.createForClass(Recurrence);

export type AppointmentDocument = HydratedDocument<Appointment>;

@Schema({ timestamps: true, collection: 'appointments' })
export class Appointment {
  @Prop({ required: true, unique: true, default: () => nanoid(8) })
  shortId!: string;

  // Owning business + the user who created it (plain string ids).
  @Prop({ required: true, index: true })
  businessId!: string;

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ required: true })
  title!: string;

  // First occurrence (and its time-of-day). end must be after start.
  @Prop({ type: Date, required: true })
  start!: Date;

  @Prop({ type: Date, required: true })
  end!: Date;

  @Prop({ type: String, default: null })
  notes?: string;

  @Prop({ type: String, default: null })
  location?: string;

  @Prop({ type: [InviteeSchema], default: [] })
  invitees!: Invitee[];

  // Non-null when the appointment repeats. The client expands occurrences.
  @Prop({ type: RecurrenceSchema, default: null })
  recurrence?: Recurrence | null;

  @Prop({
    type: String,
    enum: AppointmentStatus,
    default: AppointmentStatus.SCHEDULED,
  })
  status!: AppointmentStatus;

  // createdAt / updatedAt added automatically by { timestamps: true }.
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

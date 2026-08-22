import { ApiProperty } from '@nestjs/swagger';
import {
  AppointmentStatus,
  RecurrenceFrequency,
} from '../domain/appointment.entity';

/** An invitee on an appointment. */
export class InviteeResponse {
  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ required: false, nullable: true, example: 'ada@example.com' })
  email?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  customerId?: string | null;
}

/** The recurrence rule for a repeating appointment. */
export class RecurrenceResponse {
  @ApiProperty({ enum: RecurrenceFrequency })
  frequency!: RecurrenceFrequency;

  @ApiProperty({ example: 1 })
  interval!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: 'date-time',
  })
  until?: Date | null;
}

/** Public shape of an Appointment returned by the API. */
export class AppointmentResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  id!: string;

  @ApiProperty({ example: 'aB3xY9kP' })
  shortId!: string;

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  businessId!: string;

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  createdBy!: string;

  @ApiProperty({ example: 'Client consultation' })
  title!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  start!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  end!: Date;

  @ApiProperty({ required: false, nullable: true })
  notes?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'Office, Accra' })
  location?: string | null;

  @ApiProperty({ type: [InviteeResponse] })
  invitees!: InviteeResponse[];

  @ApiProperty({ required: false, nullable: true, type: RecurrenceResponse })
  recurrence?: RecurrenceResponse | null;

  @ApiProperty({
    enum: AppointmentStatus,
    example: AppointmentStatus.SCHEDULED,
  })
  status!: AppointmentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

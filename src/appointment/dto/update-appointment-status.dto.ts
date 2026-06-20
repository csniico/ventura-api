import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AppointmentStatus } from '../schemas/appointment.schema';

/** Move an appointment to a new lifecycle status. */
export class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: AppointmentStatus, example: AppointmentStatus.COMPLETED })
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;
}

import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAppointmentDto } from './create-appointment.dto';

/**
 * Update an appointment. All fields optional. Set `clearRecurrence: true` to
 * turn a repeating appointment into a one-off (mirrors the Flutter model).
 */
export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  clearRecurrence?: boolean;
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecurrenceFrequency } from '../schemas/appointment.schema';

export class InviteeDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ required: false, example: 'ada@example.com', format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class RecurrenceDto {
  @ApiProperty({ enum: RecurrenceFrequency })
  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  interval?: number;

  // ISO date string for the last day an occurrence may fall on.
  @ApiProperty({ required: false, example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  until?: string;
}

export class CreateAppointmentDto {
  @ApiProperty({ example: 'Client consultation' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: '2026-06-17T09:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  start!: string;

  @ApiProperty({ example: '2026-06-17T10:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  end!: string;

  @ApiProperty({ required: false, example: 'Bring the signed contract.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, example: 'Office, Accra' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false, type: [InviteeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteeDto)
  invitees?: InviteeDto[];

  @ApiProperty({ required: false, type: RecurrenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}

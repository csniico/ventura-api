import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../domain/invoice.entity';

/** Record a payment against an invoice. */
export class RecordPaymentDto {
  @ApiProperty({ example: 9.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty({ required: false, example: '2026-06-17T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}

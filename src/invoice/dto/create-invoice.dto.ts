import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { InvoiceType } from '../domain/invoice.entity';

/** Create an invoice from one or more existing orders. */
export class CreateInvoiceDto {
  @ApiProperty({ type: [String], example: ['665f1b2c3d4e5f6a7b8c9d0e'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderIds!: string[];

  @ApiProperty({ required: false, enum: InvoiceType })
  @IsOptional()
  @IsEnum(InvoiceType)
  invoiceType?: InvoiceType;

  @ApiProperty({ required: false, example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ required: false, example: 'Payment due within 14 days.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

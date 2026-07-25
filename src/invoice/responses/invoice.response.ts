import { ApiProperty } from '@nestjs/swagger';
import {
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
} from '../domain/invoice.entity';

/** Public shape of an Invoice returned by the API. */
export class InvoiceResponse {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  _id!: string;

  @ApiProperty({ example: 'VEN-260617120000123-AB12CD' })
  invoiceNumber!: string;

  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  businessId!: string;

  @ApiProperty({ type: [String], example: ['665f1b2c3d4e5f6a7b8c9d0e'] })
  orderIds!: string[];

  @ApiProperty({ required: false, nullable: true })
  customerId?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'Ada Lovelace' })
  customerName?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'ada@example.com',
  })
  customerEmail?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '+233200000000' })
  customerPhone?: string | null;

  @ApiProperty({ enum: InvoiceType })
  invoiceType!: InvoiceType;

  @ApiProperty({ example: 100.0 })
  subtotal!: number;

  @ApiProperty({ example: 0.15 })
  vatRate!: number;

  @ApiProperty({ example: 15.0 })
  vatAmount!: number;

  @ApiProperty({ example: 0.025 })
  nhilRate!: number;

  @ApiProperty({ example: 2.5 })
  nhilAmount!: number;

  @ApiProperty({ example: 0.025 })
  getfundRate!: number;

  @ApiProperty({ example: 2.5 })
  getfundAmount!: number;

  @ApiProperty({ example: 20.0 })
  totalTax!: number;

  @ApiProperty({ example: 120.0 })
  totalAmount!: number;

  @ApiProperty({ example: 0 })
  amountPaid!: number;

  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;

  @ApiProperty({ required: false, nullable: true, enum: PaymentMethod })
  paymentMethod?: PaymentMethod | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: 'date-time',
  })
  paymentDate?: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: 'date-time',
  })
  issueDate?: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: 'date-time',
  })
  dueDate?: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: 'date-time',
  })
  sentAt?: Date | null;

  @ApiProperty({ required: false, nullable: true })
  notes?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

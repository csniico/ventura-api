import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceType {
  STANDARD = 'STANDARD',
  PROFORMA = 'PROFORMA',
  RECEIPT = 'RECEIPT',
}

export enum PaymentMethod {
  CASH = 'CASH',
  MOBILE_MONEY = 'MOBILE_MONEY',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  CHEQUE = 'CHEQUE',
}

export type InvoiceDocument = HydratedDocument<Invoice>;

/** Generate a unique invoice number: VEN-<yymmddHHMMSSmmm>-<rand>. */
function generateInvoiceNumber(): string {
  const now = new Date();
  const p = (n: number, len = 2) => n.toString().padStart(len, '0');
  const ts =
    `${now.getFullYear().toString().slice(-2)}${p(now.getMonth() + 1)}` +
    `${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}` +
    `${p(now.getSeconds())}${p(now.getMilliseconds(), 3)}`;
  return `VEN-${ts}-${nanoid(6).toUpperCase()}`;
}

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  @Prop({ required: true, unique: true, default: generateInvoiceNumber })
  invoiceNumber!: string;

  @Prop({ required: true, index: true })
  businessId!: string;

  // Orders covered by this invoice (plain string ids).
  @Prop({ type: [String], default: [] })
  orderIds!: string[];

  // Customer snapshot (taken from the orders' customer).
  @Prop({ type: String, default: null, index: true })
  customerId?: string;

  @Prop({ type: String, default: null })
  customerName?: string;

  @Prop({ type: String, default: null })
  customerEmail?: string;

  @Prop({ type: String, default: null })
  customerPhone?: string;

  @Prop({ type: String, enum: InvoiceType, default: InvoiceType.STANDARD })
  invoiceType!: InvoiceType;

  // Financials — Ghana VAT structure (VAT 15% + NHIL 2.5% + GETFund 2.5%).
  @Prop({ type: Number, required: true })
  subtotal!: number;

  @Prop({ type: Number, default: 0.15 })
  vatRate!: number;

  @Prop({ type: Number, required: true })
  vatAmount!: number;

  @Prop({ type: Number, default: 0.025 })
  nhilRate!: number;

  @Prop({ type: Number, required: true })
  nhilAmount!: number;

  @Prop({ type: Number, default: 0.025 })
  getfundRate!: number;

  @Prop({ type: Number, required: true })
  getfundAmount!: number;

  @Prop({ type: Number, required: true })
  totalTax!: number;

  @Prop({ type: Number, required: true })
  totalAmount!: number;

  // Payment tracking.
  @Prop({ type: Number, default: 0 })
  amountPaid!: number;

  @Prop({ type: String, enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status!: InvoiceStatus;

  @Prop({ type: String, enum: PaymentMethod, default: null })
  paymentMethod?: PaymentMethod | null;

  @Prop({ type: Date, default: null })
  paymentDate?: Date | null;

  @Prop({ type: Date, default: null })
  issueDate?: Date | null;

  @Prop({ type: Date, default: null })
  dueDate?: Date | null;

  @Prop({ type: Date, default: null })
  sentAt?: Date | null;

  @Prop({ type: String, default: null })
  notes?: string;

  // createdAt / updatedAt added automatically by { timestamps: true }.
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

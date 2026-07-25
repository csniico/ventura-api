import {
  DailyRevenue,
  IInvoice,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
} from './invoice.entity';

/** Fields accepted when creating an invoice (scoped to a business). */
export interface ICreateInvoice {
  businessId: string;
  orderIds: string[];
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  invoiceType: InvoiceType;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  nhilRate: number;
  nhilAmount: number;
  getfundRate: number;
  getfundAmount: number;
  totalTax: number;
  totalAmount: number;
  issueDate?: Date | null;
  dueDate?: Date | null;
  notes?: string | null;
}

/** Partial patch applied to an existing invoice. Only present keys are written. */
export interface IUpdateInvoice {
  amountPaid?: number;
  status?: InvoiceStatus;
  paymentMethod?: PaymentMethod | null;
  paymentDate?: Date | null;
  sentAt?: Date | null;
}

/** Options for a paginated, optionally-filtered invoice listing. */
export interface ListInvoicesOptions {
  skip: number;
  limit: number;
  q?: string;
  status?: InvoiceStatus;
  customerId?: string;
}

/**
 * Data-access boundary for invoices. Every read/write is scoped by `businessId`.
 * Business rules (VAT calc, order linking, payment/status transitions) live in
 * the service; revenue analytics are exposed here as single aggregate queries.
 */
export interface InvoiceRepository {
  create(data: ICreateInvoice): Promise<IInvoice>;
  findById(businessId: string, id: string): Promise<IInvoice | null>;
  list(
    businessId: string,
    opts: ListInvoicesOptions,
  ): Promise<{ data: IInvoice[]; total: number }>;
  update(
    businessId: string,
    id: string,
    patch: IUpdateInvoice,
  ): Promise<IInvoice | null>;
  /** Sum collected revenue (amountPaid) within an optional paymentDate window. */
  sumAmountPaid(businessId: string, from?: Date, to?: Date): Promise<number>;
  /** The latest `limit` invoices, newest first. */
  recent(businessId: string, limit: number): Promise<IInvoice[]>;
  /** Collected revenue grouped by paymentDate day (UTC), within a window. */
  dailyRevenue(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<DailyRevenue[]>;
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const INVOICE_DATA_SOURCE = Symbol('INVOICE_DATA_SOURCE');

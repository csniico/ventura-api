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

/**
 * Domain contract for an invoice. Mirrors the public `InvoiceResponse`. Customer
 * details are snapshotted from the covered orders; `businessId` scopes every
 * read/write. Financials follow the Ghana VAT structure (VAT 15% + NHIL 2.5% +
 * GETFund 2.5%).
 */
export interface IInvoice {
  id: string
  invoiceNumber: string
  businessId: string
  orderIds: string[]
  customerId?: string | null
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  invoiceType: InvoiceType
  subtotal: number
  vatRate: number
  vatAmount: number
  nhilRate: number
  nhilAmount: number
  getfundRate: number
  getfundAmount: number
  totalTax: number
  totalAmount: number
  amountPaid: number
  status: InvoiceStatus
  paymentMethod?: PaymentMethod | null
  paymentDate?: Date | null
  issueDate?: Date | null
  dueDate?: Date | null
  sentAt?: Date | null
  notes?: string | null
  createdAt: Date
  updatedAt: Date
}

/** A day of collected revenue (for the dashboard chart). */
export interface DailyRevenue {
  date: string
  amount: number
}

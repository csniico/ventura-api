import { IInvoice } from '../domain/invoice.entity'
import { InvoiceResponse } from '../responses/invoice.response'

/**
 * Project a domain `IInvoice` onto the public `InvoiceResponse` contract,
 * normalising nullable columns.
 */
export function toInvoiceResponse(invoice: IInvoice): InvoiceResponse {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    businessId: invoice.businessId,
    orderIds: invoice.orderIds ?? [],
    customerId: invoice.customerId ?? null,
    customerName: invoice.customerName ?? null,
    customerEmail: invoice.customerEmail ?? null,
    customerPhone: invoice.customerPhone ?? null,
    invoiceType: invoice.invoiceType,
    subtotal: invoice.subtotal,
    vatRate: invoice.vatRate,
    vatAmount: invoice.vatAmount,
    nhilRate: invoice.nhilRate,
    nhilAmount: invoice.nhilAmount,
    getfundRate: invoice.getfundRate,
    getfundAmount: invoice.getfundAmount,
    totalTax: invoice.totalTax,
    totalAmount: invoice.totalAmount,
    amountPaid: invoice.amountPaid,
    status: invoice.status,
    paymentMethod: invoice.paymentMethod ?? null,
    paymentDate: invoice.paymentDate ?? null,
    issueDate: invoice.issueDate ?? null,
    dueDate: invoice.dueDate ?? null,
    sentAt: invoice.sentAt ?? null,
    notes: invoice.notes ?? null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  }
}

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  normalizePaging,
  Paginated,
  paginate,
} from '../../common/dto/paginated'
import { MailService } from '../../mail/mail.service'
import { OrderService } from '../../order/application/order.service'
import { OrderStatus } from '../../order/domain/order.entity'
import {
  DailyRevenue,
  IInvoice,
  InvoiceStatus,
  InvoiceType,
} from '../domain/invoice.entity'
import type { InvoiceRepository } from '../domain/invoice.repository'
import { INVOICE_DATA_SOURCE } from '../domain/invoice.repository'
import { CreateInvoiceDto } from '../dto/create-invoice.dto'
import { RecordPaymentDto } from '../dto/record-payment.dto'
import { SendInvoiceDto } from '../dto/send-invoice.dto'

// Ghana VAT structure.
const VAT_RATE = 0.15
const NHIL_RATE = 0.025
const GETFUND_RATE = 0.025

/** Round to 2 decimal places to keep money values clean. */
const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Postgres-backed invoice service. Data access goes through the
 * `InvoiceRepository` abstraction (DIP); business rules (VAT calc, order
 * validation + linking, payment/status transitions) live here. Every operation
 * is scoped to a `businessId`. Methods return the domain `IInvoice`; mapping to
 * `InvoiceResponse` happens at the controller boundary.
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(INVOICE_DATA_SOURCE)
    private readonly invoiceRepository: InvoiceRepository,
    private readonly orderService: OrderService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Create an invoice from existing orders. Validates the orders belong to the
   * business, are not already invoiced, and share one customer. Computes the
   * Ghana VAT breakdown, links the orders, and snapshots the customer.
   */
  async create(businessId: string, dto: CreateInvoiceDto): Promise<IInvoice> {
    const orders = await this.orderService.findByIdsInBusiness(
      businessId,
      dto.orderIds,
    )

    if (orders.length !== dto.orderIds.length) {
      throw new NotFoundException(
        'One or more orders were not found in this business.',
      )
    }

    const alreadyInvoiced = orders.filter((o) => o.invoiceId)
    if (alreadyInvoiced.length > 0) {
      throw new ConflictException(
        'One or more orders are already on an invoice.',
      )
    }

    // Cancelled orders must not be billed — their stock was already restored.
    const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED)
    if (cancelled.length > 0) {
      throw new BadRequestException(
        'One or more orders are cancelled and cannot be invoiced.',
      )
    }

    // All orders on one invoice must belong to the same customer.
    const customerIds = new Set(orders.map((o) => o.customerId))
    if (customerIds.size > 1) {
      throw new BadRequestException(
        'All orders on an invoice must belong to the same customer.',
      )
    }

    // Ghana VAT: the NHIL + GETFund levies are charged on the subtotal, and the
    // 15% VAT is charged on the levy-inclusive base (not the bare subtotal).
    const subtotal = round2(orders.reduce((sum, o) => sum + o.totalAmount, 0))
    const nhilAmount = round2(subtotal * NHIL_RATE)
    const getfundAmount = round2(subtotal * GETFUND_RATE)
    const vatAmount = round2((subtotal + nhilAmount + getfundAmount) * VAT_RATE)
    const totalTax = round2(vatAmount + nhilAmount + getfundAmount)
    const totalAmount = round2(subtotal + totalTax)

    const first = orders[0]

    const invoice = await this.invoiceRepository.create({
      businessId,
      orderIds: dto.orderIds,
      customerId: first.customerId,
      customerName: first.customerName,
      customerEmail: first.customerEmail ?? null,
      customerPhone: first.customerPhone ?? null,
      invoiceType: dto.invoiceType ?? InvoiceType.STANDARD,
      subtotal,
      vatRate: VAT_RATE,
      vatAmount,
      nhilRate: NHIL_RATE,
      nhilAmount,
      getfundRate: GETFUND_RATE,
      getfundAmount,
      totalTax,
      totalAmount,
      issueDate: new Date(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      notes: dto.notes ?? null,
    })

    // Link the orders to this invoice.
    await this.orderService.attachInvoice(businessId, dto.orderIds, invoice.id)

    return invoice
  }

  /**
   * List a business's invoices, newest first, paginated. Optional status/customer
   * filter. Optional `q` matches (case-insensitive) invoiceNumber or customerName.
   */
  async list(
    businessId: string,
    opts: {
      page?: number
      limit?: number
      q?: string
      status?: InvoiceStatus
      customerId?: string
    } = {},
  ): Promise<Paginated<IInvoice>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit)
    const { data, total } = await this.invoiceRepository.list(businessId, {
      skip,
      limit,
      q: opts.q,
      status: opts.status,
      customerId: opts.customerId,
    })
    return paginate(data, total, page, limit)
  }

  /** Get an invoice by id, scoped to the business. */
  async getById(businessId: string, invoiceId: string): Promise<IInvoice> {
    const invoice = await this.invoiceRepository.findById(businessId, invoiceId)
    if (!invoice) {
      throw new NotFoundException('Invoice not found.')
    }
    return invoice
  }

  /**
   * Record a payment. Increases amountPaid and auto-sets the status to PAID
   * (fully covered) or PARTIALLY_PAID. Overpaying or paying a cancelled invoice
   * is rejected.
   */
  async recordPayment(
    businessId: string,
    invoiceId: string,
    dto: RecordPaymentDto,
  ): Promise<IInvoice> {
    const invoice = await this.getById(businessId, invoiceId)

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay a cancelled invoice.')
    }

    const newPaid = round2(invoice.amountPaid + dto.amount)
    if (newPaid > invoice.totalAmount) {
      throw new BadRequestException('Payment exceeds the invoice total amount.')
    }

    const updated = await this.invoiceRepository.update(businessId, invoiceId, {
      amountPaid: newPaid,
      paymentMethod: dto.paymentMethod,
      paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
      status:
        newPaid >= invoice.totalAmount
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID,
    })
    return updated ?? invoice
  }

  /**
   * Email the invoice to the customer. Recipient is dto.email when provided,
   * otherwise the invoice's customer email; one of them must exist. Cancelled
   * invoices cannot be sent. Records sentAt and promotes a DRAFT to SENT without
   * downgrading an already-paid invoice.
   */
  async send(
    businessId: string,
    invoiceId: string,
    dto: SendInvoiceDto,
  ): Promise<IInvoice> {
    const invoice = await this.getById(businessId, invoiceId)

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot send a cancelled invoice.')
    }

    const recipient = dto.email ?? invoice.customerEmail
    if (!recipient) {
      throw new BadRequestException('No recipient email for this invoice.')
    }

    await this.mailService.sendInvoice(recipient, {
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName ?? undefined,
      totalAmount: invoice.totalAmount,
      message: dto.message,
    })

    const updated = await this.invoiceRepository.update(businessId, invoiceId, {
      sentAt: new Date(),
      status:
        invoice.status === InvoiceStatus.DRAFT
          ? InvoiceStatus.SENT
          : invoice.status,
    })
    return updated ?? invoice
  }

  /**
   * Legal direct status transitions. PAID / PARTIALLY_PAID are NOT reachable
   * here — they are set only by {@link recordPayment} so `amountPaid` and
   * `status` can never disagree. CANCELLED is terminal.
   */
  private static readonly INVOICE_TRANSITIONS: Record<
    InvoiceStatus,
    InvoiceStatus[]
  > = {
    [InvoiceStatus.DRAFT]: [InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
    [InvoiceStatus.SENT]: [InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
    [InvoiceStatus.PARTIALLY_PAID]: [
      InvoiceStatus.OVERDUE,
      InvoiceStatus.CANCELLED,
    ],
    [InvoiceStatus.OVERDUE]: [InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
    [InvoiceStatus.PAID]: [InvoiceStatus.CANCELLED],
    [InvoiceStatus.CANCELLED]: [],
  }

  /**
   * Update an invoice's status along the allowed transition path. Jumps to
   * PAID / PARTIALLY_PAID are rejected (record a payment instead). Cancelling an
   * invoice releases its orders so they can be re-invoiced.
   */
  async updateStatus(
    businessId: string,
    invoiceId: string,
    status: InvoiceStatus,
  ): Promise<IInvoice> {
    const invoice = await this.getById(businessId, invoiceId)

    if (invoice.status === status) {
      return invoice
    }

    if (
      status === InvoiceStatus.PAID ||
      status === InvoiceStatus.PARTIALLY_PAID
    ) {
      throw new BadRequestException(
        'Payment status is set by recording a payment, not directly.',
      )
    }

    const allowed = InvoiceService.INVOICE_TRANSITIONS[invoice.status]
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot change invoice status from ${invoice.status} to ${status}.`,
      )
    }

    const updated = await this.invoiceRepository.update(businessId, invoiceId, {
      status,
    })
    if (!updated) {
      throw new NotFoundException('Invoice not found.')
    }

    // Releasing the orders lets them be billed again on a new invoice.
    if (status === InvoiceStatus.CANCELLED && invoice.orderIds.length > 0) {
      await this.orderService.detachInvoice(businessId, invoice.orderIds)
    }

    return updated
  }

  // --- Revenue analytics (for the dashboard) ---

  /** Sum collected revenue (amountPaid) within an optional paymentDate window. */
  async sumAmountPaid(
    businessId: string,
    from?: Date,
    to?: Date,
  ): Promise<number> {
    return await this.invoiceRepository.sumAmountPaid(businessId, from, to)
  }

  /** The latest `limit` invoices, newest first. */
  async recent(businessId: string, limit: number): Promise<IInvoice[]> {
    return await this.invoiceRepository.recent(businessId, limit)
  }

  /** Collected revenue grouped by paymentDate day, within a window. */
  async dailyRevenue(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<DailyRevenue[]> {
    return await this.invoiceRepository.dailyRevenue(businessId, from, to)
  }
}

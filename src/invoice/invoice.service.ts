import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderService } from '../order/order.service';
import { MailService } from '../mail/mail.service';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
  InvoiceType,
} from './schemas/invoice.schema';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { Paginated, normalizePaging, paginate } from '../common/dto/paginated';
import { escapeRegex } from '../common/util/escape-regex';

// Ghana VAT structure.
const VAT_RATE = 0.15;
const NHIL_RATE = 0.025;
const GETFUND_RATE = 0.025;

/** Round to 2 decimal places to keep money values clean. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class InvoiceService {
  constructor(
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    private readonly orderService: OrderService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Create an invoice from existing orders. Validates the orders belong to the
   * business, are not already invoiced, and share one customer. Computes the
   * Ghana VAT breakdown, links the orders, and snapshots the customer.
   */
  async create(
    businessId: string,
    dto: CreateInvoiceDto,
  ): Promise<InvoiceDocument> {
    const orders = await this.orderService.findByIdsInBusiness(
      businessId,
      dto.orderIds,
    );

    if (orders.length !== dto.orderIds.length) {
      throw new NotFoundException(
        'One or more orders were not found in this business.',
      );
    }

    const alreadyInvoiced = orders.filter((o) => o.invoiceId);
    if (alreadyInvoiced.length > 0) {
      throw new ConflictException(
        'One or more orders are already on an invoice.',
      );
    }

    // All orders on one invoice must belong to the same customer.
    const customerIds = new Set(orders.map((o) => o.customerId));
    if (customerIds.size > 1) {
      throw new BadRequestException(
        'All orders on an invoice must belong to the same customer.',
      );
    }

    const subtotal = round2(orders.reduce((sum, o) => sum + o.totalAmount, 0));
    const vatAmount = round2(subtotal * VAT_RATE);
    const nhilAmount = round2(subtotal * NHIL_RATE);
    const getfundAmount = round2(subtotal * GETFUND_RATE);
    const totalTax = round2(vatAmount + nhilAmount + getfundAmount);
    const totalAmount = round2(subtotal + totalTax);

    const first = orders[0];

    const invoice = await this.invoiceModel.create({
      businessId,
      orderIds: dto.orderIds,
      customerId: first.customerId,
      customerName: first.customerName,
      customerEmail: first.customerEmail,
      customerPhone: first.customerPhone,
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
      notes: dto.notes,
    });

    // Link the orders to this invoice.
    await this.orderService.attachInvoice(
      businessId,
      dto.orderIds,
      String(invoice._id),
    );

    return invoice;
  }

  /**
   * List a business's invoices, newest first, paginated. Optional status/customer
   * filter. Optional `q` matches (case-insensitive) invoiceNumber or customerName.
   */
  async list(
    businessId: string,
    opts: {
      page?: number;
      limit?: number;
      q?: string;
      status?: InvoiceStatus;
      customerId?: string;
    } = {},
  ): Promise<Paginated<InvoiceDocument>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit);
    const query: Record<string, unknown> = { businessId };
    if (opts.status) query.status = opts.status;
    if (opts.customerId) query.customerId = opts.customerId;
    if (opts.q?.trim()) {
      const rx = new RegExp(escapeRegex(opts.q.trim()), 'i');
      query.$or = [{ invoiceNumber: rx }, { customerName: rx }];
    }

    const [data, total] = await Promise.all([
      this.invoiceModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.invoiceModel.countDocuments(query).exec(),
    ]);

    return paginate(data, total, page, limit);
  }

  /** Get an invoice by id, scoped to the business. */
  async getById(
    businessId: string,
    invoiceId: string,
  ): Promise<InvoiceDocument> {
    const invoice = await this.invoiceModel
      .findOne({ _id: invoiceId, businessId })
      .exec();
    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }
    return invoice;
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
  ): Promise<InvoiceDocument> {
    const invoice = await this.getById(businessId, invoiceId);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay a cancelled invoice.');
    }

    const newPaid = round2(invoice.amountPaid + dto.amount);
    if (newPaid > invoice.totalAmount) {
      throw new BadRequestException(
        'Payment exceeds the invoice total amount.',
      );
    }

    invoice.amountPaid = newPaid;
    invoice.paymentMethod = dto.paymentMethod;
    invoice.paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    invoice.status =
      newPaid >= invoice.totalAmount
        ? InvoiceStatus.PAID
        : InvoiceStatus.PARTIALLY_PAID;

    return invoice.save();
  }

  /**
   * Email the invoice to the customer. Recipient is dto.email when provided,
   * otherwise the invoice's customer email; one of them must exist. Cancelled
   * invoices cannot be sent. Records sentAt and promotes a DRAFT to SENT
   * without downgrading an already-paid invoice.
   */
  async send(
    businessId: string,
    invoiceId: string,
    dto: SendInvoiceDto,
  ): Promise<InvoiceDocument> {
    const invoice = await this.getById(businessId, invoiceId);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot send a cancelled invoice.');
    }

    const recipient = dto.email ?? invoice.customerEmail;
    if (!recipient) {
      throw new BadRequestException('No recipient email for this invoice.');
    }

    await this.mailService.sendInvoice(recipient, {
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      totalAmount: invoice.totalAmount,
      message: dto.message,
    });

    invoice.sentAt = new Date();
    if (invoice.status === InvoiceStatus.DRAFT) {
      invoice.status = InvoiceStatus.SENT;
    }

    return invoice.save();
  }

  /** Update an invoice's status directly. */
  async updateStatus(
    businessId: string,
    invoiceId: string,
    status: InvoiceStatus,
  ): Promise<InvoiceDocument> {
    const invoice = await this.getById(businessId, invoiceId);
    invoice.status = status;
    return invoice.save();
  }
}

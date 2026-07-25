import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { FilterQuery } from '@mikro-orm/core';
import { DailyRevenue, IInvoice } from '../domain/invoice.entity';
import {
  ICreateInvoice,
  IUpdateInvoice,
  InvoiceRepository,
  ListInvoicesOptions,
} from '../domain/invoice.repository';
import {
  PostgresInvoice,
  PostgresInvoiceEntity,
} from '../domain/postgres.invoice-entity';

/** Escape LIKE/ILIKE wildcards so a raw search term matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

@Injectable()
export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly em: EntityManager) {}

  private toDomain(entity: PostgresInvoice): IInvoice {
    // double precision may surface as string via the driver; normalise money.
    const num = (v: string | number) => Number(v);
    return {
      id: entity.id,
      invoiceNumber: entity.invoiceNumber,
      businessId: entity.businessId,
      orderIds: entity.orderIds,
      customerId: entity.customerId,
      customerName: entity.customerName,
      customerEmail: entity.customerEmail,
      customerPhone: entity.customerPhone,
      invoiceType: entity.invoiceType,
      subtotal: num(entity.subtotal),
      vatRate: num(entity.vatRate),
      vatAmount: num(entity.vatAmount),
      nhilRate: num(entity.nhilRate),
      nhilAmount: num(entity.nhilAmount),
      getfundRate: num(entity.getfundRate),
      getfundAmount: num(entity.getfundAmount),
      totalTax: num(entity.totalTax),
      totalAmount: num(entity.totalAmount),
      amountPaid: num(entity.amountPaid),
      status: entity.status,
      paymentMethod: entity.paymentMethod,
      paymentDate: entity.paymentDate,
      issueDate: entity.issueDate,
      dueDate: entity.dueDate,
      sentAt: entity.sentAt,
      notes: entity.notes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async create(data: ICreateInvoice): Promise<IInvoice> {
    const invoice = this.em.create(PostgresInvoiceEntity, data);
    await this.em.flush();
    return this.toDomain(invoice);
  }

  async findById(businessId: string, id: string): Promise<IInvoice | null> {
    const invoice = await this.em.findOne(PostgresInvoiceEntity, {
      id,
      businessId,
    });
    return invoice ? this.toDomain(invoice) : null;
  }

  async list(
    businessId: string,
    opts: ListInvoicesOptions,
  ): Promise<{ data: IInvoice[]; total: number }> {
    const where: FilterQuery<PostgresInvoice> = { businessId };
    if (opts.status) where.status = opts.status;
    if (opts.customerId) where.customerId = opts.customerId;
    if (opts.q?.trim()) {
      const like = `%${escapeLike(opts.q.trim())}%`;
      where.$or = [
        { invoiceNumber: { $ilike: like } },
        { customerName: { $ilike: like } },
      ];
    }

    const [rows, total] = await this.em.findAndCount(
      PostgresInvoiceEntity,
      where,
      { orderBy: { createdAt: 'DESC' }, limit: opts.limit, offset: opts.skip },
    );
    return { data: rows.map((i) => this.toDomain(i)), total };
  }

  async update(
    businessId: string,
    id: string,
    patch: IUpdateInvoice,
  ): Promise<IInvoice | null> {
    const invoice = await this.em.findOne(PostgresInvoiceEntity, {
      id,
      businessId,
    });
    if (!invoice) {
      return null;
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    this.em.assign(invoice, clean);
    await this.em.flush();
    return this.toDomain(invoice);
  }

  async sumAmountPaid(
    businessId: string,
    from?: Date,
    to?: Date,
  ): Promise<number> {
    let sql = `select coalesce(sum(amount_paid), 0) as total
               from invoices
               where business_id = ? and amount_paid > 0`;
    const params: unknown[] = [businessId];
    if (from) {
      sql += ` and payment_date >= ?`;
      params.push(from);
    }
    if (to) {
      sql += ` and payment_date < ?`;
      params.push(to);
    }
    const rows = await this.em
      .getConnection()
      .execute<{ total: string | number }[]>(sql, params);
    return Number(rows[0]?.total ?? 0);
  }

  async recent(businessId: string, limit: number): Promise<IInvoice[]> {
    const rows = await this.em.find(
      PostgresInvoiceEntity,
      { businessId },
      { orderBy: { createdAt: 'DESC' }, limit },
    );
    return rows.map((i) => this.toDomain(i));
  }

  async dailyRevenue(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<DailyRevenue[]> {
    // Group collected revenue by paymentDate day in UTC (matches Mongo's
    // $dateToString, which formats in UTC).
    const rows = await this.em
      .getConnection()
      .execute<{ date: string; amount: string | number }[]>(
        `select to_char(payment_date at time zone 'UTC', 'YYYY-MM-DD') as date,
              sum(amount_paid) as amount
       from invoices
       where business_id = ? and amount_paid > 0
         and payment_date >= ? and payment_date <= ?
       group by 1
       order by 1`,
        [businessId, from, to],
      );
    return rows.map((r) => ({ date: r.date, amount: Number(r.amount) }));
  }
}

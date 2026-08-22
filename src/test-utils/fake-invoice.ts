import type { Provider } from '@nestjs/common';
import {
  DailyRevenue,
  IInvoice,
  InvoiceStatus,
} from '../invoice/domain/invoice.entity';
import {
  ICreateInvoice,
  INVOICE_DATA_SOURCE,
  IUpdateInvoice,
  InvoiceRepository,
  ListInvoicesOptions,
} from '../invoice/domain/invoice.repository';
import { InvoiceService } from '../invoice/application/invoice.service';

let counter = 0;

/**
 * In-memory `InvoiceRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics, business-scoped queries, and the revenue aggregations
 * (sum / recent / daily, grouped by UTC day).
 */
export class FakeInvoiceRepository implements InvoiceRepository {
  private readonly rows = new Map<string, IInvoice>();
  private seq = 0;

  create(data: ICreateInvoice): Promise<IInvoice> {
    const now = new Date();
    counter += 1;
    const invoice: IInvoice = {
      id: `50000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      invoiceNumber: `VEN-${String(counter).padStart(12, '0')}`,
      businessId: data.businessId,
      orderIds: data.orderIds,
      customerId: data.customerId ?? null,
      customerName: data.customerName ?? null,
      customerEmail: data.customerEmail ?? null,
      customerPhone: data.customerPhone ?? null,
      invoiceType: data.invoiceType,
      subtotal: data.subtotal,
      vatRate: data.vatRate,
      vatAmount: data.vatAmount,
      nhilRate: data.nhilRate,
      nhilAmount: data.nhilAmount,
      getfundRate: data.getfundRate,
      getfundAmount: data.getfundAmount,
      totalTax: data.totalTax,
      totalAmount: data.totalAmount,
      amountPaid: 0,
      status: InvoiceStatus.DRAFT,
      paymentMethod: null,
      paymentDate: null,
      issueDate: data.issueDate ?? null,
      dueDate: data.dueDate ?? null,
      sentAt: null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(invoice.id, invoice);
    return Promise.resolve({ ...invoice });
  }
  findById(businessId: string, id: string): Promise<IInvoice | null> {
    const i = this.rows.get(id);
    return Promise.resolve(i && i.businessId === businessId ? { ...i } : null);
  }
  list(
    businessId: string,
    opts: ListInvoicesOptions,
  ): Promise<{ data: IInvoice[]; total: number }> {
    let rows = [...this.rows.values()].filter(
      (i) => i.businessId === businessId,
    );
    if (opts.status) rows = rows.filter((i) => i.status === opts.status);
    if (opts.customerId)
      rows = rows.filter((i) => i.customerId === opts.customerId);
    const q = opts.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          (i.customerName?.toLowerCase().includes(q) ?? false),
      );
    }
    rows.reverse(); // newest first
    const total = rows.length;
    const data = rows
      .slice(opts.skip, opts.skip + opts.limit)
      .map((i) => ({ ...i }));
    return Promise.resolve({ data, total });
  }
  update(
    businessId: string,
    id: string,
    patch: IUpdateInvoice,
  ): Promise<IInvoice | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null);
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    const merged = { ...existing, ...clean, updatedAt: new Date() };
    this.rows.set(id, merged);
    return Promise.resolve({ ...merged });
  }
  sumAmountPaid(businessId: string, from?: Date, to?: Date): Promise<number> {
    let total = 0;
    for (const i of this.rows.values()) {
      if (i.businessId !== businessId || i.amountPaid <= 0) continue;
      if (from && !(i.paymentDate && i.paymentDate >= from)) continue;
      if (to && !(i.paymentDate && i.paymentDate < to)) continue;
      total += i.amountPaid;
    }
    return Promise.resolve(total);
  }
  recent(businessId: string, limit: number): Promise<IInvoice[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((i) => i.businessId === businessId)
        .reverse()
        .slice(0, limit)
        .map((i) => ({ ...i })),
    );
  }
  dailyRevenue(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<DailyRevenue[]> {
    const byDay = new Map<string, number>();
    for (const i of this.rows.values()) {
      if (i.businessId !== businessId || i.amountPaid <= 0 || !i.paymentDate) {
        continue;
      }
      if (i.paymentDate < from || i.paymentDate > to) continue;
      const day = i.paymentDate.toISOString().slice(0, 10); // UTC YYYY-MM-DD
      byDay.set(day, (byDay.get(day) ?? 0) + i.amountPaid);
    }
    return Promise.resolve(
      [...byDay.entries()]
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  markOverdue(now: Date): Promise<number> {
    let count = 0;
    for (const i of this.rows.values()) {
      const overduable =
        i.status === InvoiceStatus.SENT ||
        i.status === InvoiceStatus.PARTIALLY_PAID;
      if (overduable && i.dueDate && i.dueDate < now) {
        this.rows.set(i.id, { ...i, status: InvoiceStatus.OVERDUE });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear();
    this.seq = 0;
  }
  _get(id: string): IInvoice | undefined {
    return this.rows.get(id);
  }
  _count(): number {
    return this.rows.size;
  }
}

/**
 * Providers for a fake-backed `InvoiceService` plus a handle to the fake store.
 * The consuming module must also provide `OrderService` + `MailService`
 * (InvoiceService depends on them).
 */
export function fakeInvoiceServiceProviders(): {
  providers: Provider[];
  invoices: FakeInvoiceRepository;
} {
  const invoices = new FakeInvoiceRepository();
  return {
    invoices,
    providers: [
      InvoiceService,
      { provide: INVOICE_DATA_SOURCE, useValue: invoices },
    ],
  };
}

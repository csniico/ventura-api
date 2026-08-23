import { Injectable } from '@nestjs/common'
import { InvoiceService } from '../invoice/application/invoice.service'
import { OrderService } from '../order/application/order.service'
import { ResourceService } from '../resource/application/resource.service'

export interface DashboardSummary {
  revenue: {
    total: number
    last30Days: number
    previous30Days: number
    trendPercent: number | null
  }
  inventory: {
    lowStockCount: number
    topProducts: { resourceId: string; name: string; unitsSold: number }[]
  }
  recentInvoices: {
    invoiceId: string
    invoiceNumber: string
    customerName: string | null
    totalAmount: number
    status: string
    createdAt: Date
  }[]
  dailyRevenue: { date: string; amount: number }[]
}

/** Round to 2 decimals. */
const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Aggregates the dashboard summary from the (now Postgres-backed) invoice,
 * order, and resource services. This service holds no data access of its own —
 * each figure is delegated to the owning service.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly orderService: OrderService,
    private readonly resourceService: ResourceService,
  ) {}

  async getSummary(
    businessId: string,
    rangeDays: number,
    now: Date = new Date(),
  ): Promise<DashboardSummary> {
    const [revenue, inventory, recentInvoices, dailyRevenue] =
      await Promise.all([
        this.getRevenue(businessId, now),
        this.getInventory(businessId),
        this.getRecentInvoices(businessId),
        this.getDailyRevenue(businessId, rangeDays, now),
      ])

    return { revenue, inventory, recentInvoices, dailyRevenue }
  }

  /** Total collected + last-30d vs prior-30d trend (revenue = amountPaid). */
  private async getRevenue(
    businessId: string,
    now: Date,
  ): Promise<DashboardSummary['revenue']> {
    const day = 24 * 60 * 60 * 1000
    const start30 = new Date(now.getTime() - 30 * day)
    const start60 = new Date(now.getTime() - 60 * day)

    const [totalAgg, last30Agg, prev30Agg] = await Promise.all([
      this.invoiceService.sumAmountPaid(businessId),
      this.invoiceService.sumAmountPaid(businessId, start30, now),
      this.invoiceService.sumAmountPaid(businessId, start60, start30),
    ])

    const last30Days = round2(last30Agg)
    const previous30Days = round2(prev30Agg)
    const trendPercent =
      previous30Days > 0
        ? round2(((last30Days - previous30Days) / previous30Days) * 100)
        : null

    return {
      total: round2(totalAgg),
      last30Days,
      previous30Days,
      trendPercent,
    }
  }

  /** Low-stock product count + top products by units sold. */
  private async getInventory(
    businessId: string,
  ): Promise<DashboardSummary['inventory']> {
    const [lowStockCount, topProducts] = await Promise.all([
      this.resourceService.countLowStock(businessId),
      this.orderService.topProducts(businessId, 5),
    ])
    return { lowStockCount, topProducts }
  }

  /** The latest 5 invoices, newest first. */
  private async getRecentInvoices(
    businessId: string,
  ): Promise<DashboardSummary['recentInvoices']> {
    const invoices = await this.invoiceService.recent(businessId, 5)
    return invoices.map((inv) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName ?? null,
      totalAmount: inv.totalAmount,
      status: inv.status,
      createdAt: inv.createdAt,
    }))
  }

  /** Revenue (amountPaid) grouped by paymentDate day, for the last `rangeDays`. */
  private async getDailyRevenue(
    businessId: string,
    rangeDays: number,
    now: Date,
  ): Promise<DashboardSummary['dailyRevenue']> {
    const day = 24 * 60 * 60 * 1000
    const from = new Date(now.getTime() - rangeDays * day)
    const rows = await this.invoiceService.dailyRevenue(businessId, from, now)
    return rows.map((r) => ({ date: r.date, amount: round2(r.amount) }))
  }
}

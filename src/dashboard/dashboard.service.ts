import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoice/schemas/invoice.schema';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../order/schemas/order.schema';
import {
  Resource,
  ResourceDocument,
  ResourceType,
} from '../resource/schemas/resource.schema';

export interface DashboardSummary {
  revenue: {
    total: number;
    last30Days: number;
    previous30Days: number;
    trendPercent: number | null;
  };
  inventory: {
    lowStockCount: number;
    topProducts: { resourceId: string; name: string; unitsSold: number }[];
  };
  recentInvoices: {
    invoiceId: string;
    invoiceNumber: string;
    customerName: string | null;
    totalAmount: number;
    status: string;
    createdAt: Date;
  }[];
  dailyRevenue: { date: string; amount: number }[];
}

/** Round to 2 decimals. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Resource.name)
    private readonly resourceModel: Model<ResourceDocument>,
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
      ]);

    return { revenue, inventory, recentInvoices, dailyRevenue };
  }

  /** Total collected + last-30d vs prior-30d trend (revenue = amountPaid). */
  private async getRevenue(
    businessId: string,
    now: Date,
  ): Promise<DashboardSummary['revenue']> {
    const day = 24 * 60 * 60 * 1000;
    const start30 = new Date(now.getTime() - 30 * day);
    const start60 = new Date(now.getTime() - 60 * day);

    const [totalAgg, last30Agg, prev30Agg] = await Promise.all([
      this.sumPaid(businessId),
      this.sumPaid(businessId, start30, now),
      this.sumPaid(businessId, start60, start30),
    ]);

    const last30Days = round2(last30Agg);
    const previous30Days = round2(prev30Agg);
    const trendPercent =
      previous30Days > 0
        ? round2(((last30Days - previous30Days) / previous30Days) * 100)
        : null;

    return {
      total: round2(totalAgg),
      last30Days,
      previous30Days,
      trendPercent,
    };
  }

  /** Sum invoice amountPaid, optionally within a paymentDate window. */
  private async sumPaid(
    businessId: string,
    from?: Date,
    to?: Date,
  ): Promise<number> {
    const match: Record<string, unknown> = {
      businessId,
      amountPaid: { $gt: 0 },
    };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = from;
      if (to) range.$lt = to;
      match.paymentDate = range;
    }
    const result = await this.invoiceModel
      .aggregate<{
        total: number;
      }>([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  /** Low-stock product count + top products by units sold. */
  private async getInventory(
    businessId: string,
  ): Promise<DashboardSummary['inventory']> {
    const [lowStockCount, topProducts] = await Promise.all([
      this.resourceModel
        .countDocuments({
          businessId,
          type: ResourceType.PRODUCT,
          $expr: { $lte: ['$availableQuantity', '$lowStockThreshold'] },
        })
        .exec(),
      this.getTopProducts(businessId),
    ]);
    return { lowStockCount, topProducts };
  }

  /** Top 5 products by total units sold across non-cancelled orders. */
  private async getTopProducts(
    businessId: string,
  ): Promise<DashboardSummary['inventory']['topProducts']> {
    const rows = await this.orderModel
      .aggregate<{ _id: string; name: string; unitsSold: number }>([
        { $match: { businessId, status: { $ne: OrderStatus.CANCELLED } } },
        { $unwind: '$items' },
        { $match: { 'items.type': ResourceType.PRODUCT } },
        {
          $group: {
            _id: '$items.resourceId',
            name: { $first: '$items.name' },
            unitsSold: { $sum: '$items.quantity' },
          },
        },
        { $sort: { unitsSold: -1 } },
        { $limit: 5 },
      ])
      .exec();

    return rows.map((r) => ({
      resourceId: r._id,
      name: r.name,
      unitsSold: r.unitsSold,
    }));
  }

  /** The latest 5 invoices, newest first. */
  private async getRecentInvoices(
    businessId: string,
  ): Promise<DashboardSummary['recentInvoices']> {
    const invoices = await this.invoiceModel
      .find({ businessId })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    return invoices.map((inv) => ({
      invoiceId: String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName ?? null,
      totalAmount: inv.totalAmount,
      status: inv.status,
      createdAt: inv.get('createdAt') as Date,
    }));
  }

  /** Revenue (amountPaid) grouped by paymentDate day, for the last `rangeDays`. */
  private async getDailyRevenue(
    businessId: string,
    rangeDays: number,
    now: Date,
  ): Promise<DashboardSummary['dailyRevenue']> {
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(now.getTime() - rangeDays * day);

    const rows = await this.invoiceModel
      .aggregate<{ _id: string; amount: number }>([
        {
          $match: {
            businessId,
            amountPaid: { $gt: 0 },
            paymentDate: { $gte: from, $lte: now },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' },
            },
            amount: { $sum: '$amountPaid' },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    return rows.map((r) => ({ date: r._id, amount: round2(r.amount) }));
  }
}

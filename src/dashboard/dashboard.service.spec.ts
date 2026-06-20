import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';

import { DashboardService } from './dashboard.service';
import {
  Invoice,
  InvoiceDocument,
  InvoiceSchema,
  InvoiceStatus,
} from '../invoice/schemas/invoice.schema';
import {
  Order,
  OrderDocument,
  OrderSchema,
  OrderStatus,
} from '../order/schemas/order.schema';
import {
  Resource,
  ResourceDocument,
  ResourceSchema,
  ResourceType,
} from '../resource/schemas/resource.schema';
import { resolveTestUri } from '../test-utils/test-db';

describe('DashboardService (integration)', () => {
  let moduleRef: TestingModule;
  let service: DashboardService;
  let invoiceModel: Model<InvoiceDocument>;
  let orderModel: Model<OrderDocument>;
  let resourceModel: Model<ResourceDocument>;
  let connection: Connection;

  const businessA = 'biz-A';
  // Fixed "now" so date windows are deterministic.
  const now = new Date('2026-06-15T12:00:00.000Z');
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const uri = resolveTestUri('dashboard');

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Invoice.name, schema: InvoiceSchema },
          { name: Order.name, schema: OrderSchema },
          { name: Resource.name, schema: ResourceSchema },
        ]),
      ],
      providers: [DashboardService],
    }).compile();

    service = moduleRef.get(DashboardService);
    invoiceModel = moduleRef.get(getModelToken(Invoice.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    resourceModel = moduleRef.get(getModelToken(Resource.name));
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    await invoiceModel.deleteMany({});
    await orderModel.deleteMany({});
    await resourceModel.deleteMany({});
  });

  afterAll(async () => {
    await invoiceModel.deleteMany({});
    await orderModel.deleteMany({});
    await resourceModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  // Minimal invoice seed (only the fields the dashboard reads).
  async function seedInvoice(args: {
    amountPaid: number;
    paymentDate?: Date;
    status?: InvoiceStatus;
    customerName?: string;
  }) {
    return invoiceModel.create({
      businessId: businessA,
      invoiceNumber: `VEN-${Math.random().toString(36).slice(2)}`,
      subtotal: 100,
      vatAmount: 15,
      nhilAmount: 2.5,
      getfundAmount: 2.5,
      totalTax: 20,
      totalAmount: 120,
      amountPaid: args.amountPaid,
      paymentDate: args.paymentDate ?? null,
      status: args.status ?? InvoiceStatus.PARTIALLY_PAID,
      customerName: args.customerName ?? 'Ada',
    });
  }

  describe('revenue', () => {
    it('totals amountPaid and computes the 30d-vs-prior-30d trend', async () => {
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(10) }); // last 30
      await seedInvoice({ amountPaid: 50, paymentDate: daysAgo(20) }); // last 30
      await seedInvoice({ amountPaid: 60, paymentDate: daysAgo(45) }); // prior 30
      await seedInvoice({ amountPaid: 0, paymentDate: null }); // unpaid, ignored

      const summary = await service.getSummary(businessA, 30, now);

      expect(summary.revenue.total).toBe(210);
      expect(summary.revenue.last30Days).toBe(150);
      expect(summary.revenue.previous30Days).toBe(60);
      // (150 - 60) / 60 * 100 = 150%
      expect(summary.revenue.trendPercent).toBe(150);
    });

    it('trend is null when there was no prior-period revenue', async () => {
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(5) });
      const summary = await service.getSummary(businessA, 30, now);
      expect(summary.revenue.trendPercent).toBeNull();
    });
  });

  describe('inventory', () => {
    it('counts low-stock products by their own threshold', async () => {
      await resourceModel.create({
        businessId: businessA,
        type: ResourceType.PRODUCT,
        name: 'Low',
        price: 1,
        availableQuantity: 2,
        lowStockThreshold: 5,
      });
      await resourceModel.create({
        businessId: businessA,
        type: ResourceType.PRODUCT,
        name: 'Fine',
        price: 1,
        availableQuantity: 50,
        lowStockThreshold: 5,
      });
      // A service shouldn't count even at 0 stock.
      await resourceModel.create({
        businessId: businessA,
        type: ResourceType.SERVICE,
        name: 'Svc',
        price: 1,
        availableQuantity: 0,
      });

      const summary = await service.getSummary(businessA, 30, now);
      expect(summary.inventory.lowStockCount).toBe(1);
    });

    it('ranks top products by units sold across non-cancelled orders', async () => {
      const mkOrder = (
        resourceId: string,
        name: string,
        quantity: number,
        status = OrderStatus.COMPLETED,
      ) =>
        orderModel.create({
          businessId: businessA,
          orderNumber: `ORD-${Math.random().toString(36).slice(2)}`,
          customerId: 'c1',
          customerName: 'Ada',
          items: [
            {
              resourceId,
              type: ResourceType.PRODUCT,
              name,
              price: 10,
              quantity,
              subTotal: 10 * quantity,
            },
          ],
          totalAmount: 10 * quantity,
          status,
        });

      await mkOrder('r1', 'Widget', 5);
      await mkOrder('r1', 'Widget', 3);
      await mkOrder('r2', 'Gadget', 2);
      await mkOrder('r3', 'Cancelled', 100, OrderStatus.CANCELLED); // excluded

      const summary = await service.getSummary(businessA, 30, now);
      expect(summary.inventory.topProducts[0]).toMatchObject({
        resourceId: 'r1',
        unitsSold: 8,
      });
      expect(
        summary.inventory.topProducts.find((p) => p.resourceId === 'r3'),
      ).toBeUndefined();
    });
  });

  describe('recent invoices + daily series', () => {
    it('returns the latest invoices and a daily revenue series', async () => {
      await seedInvoice({
        amountPaid: 100,
        paymentDate: daysAgo(1),
        customerName: 'First',
      });
      await seedInvoice({
        amountPaid: 200,
        paymentDate: daysAgo(2),
        customerName: 'Second',
      });

      const summary = await service.getSummary(businessA, 7, now);

      expect(summary.recentInvoices).toHaveLength(2);
      expect(summary.recentInvoices[0].customerName).toBeDefined();

      // Two distinct payment days -> two buckets.
      expect(summary.dailyRevenue).toHaveLength(2);
      const totalInSeries = summary.dailyRevenue.reduce(
        (s, d) => s + d.amount,
        0,
      );
      expect(totalInSeries).toBe(300);
    });

    it('limits daily series to the requested range', async () => {
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(2) }); // in 7d
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(20) }); // outside 7d

      const summary = await service.getSummary(businessA, 7, now);
      expect(summary.dailyRevenue).toHaveLength(1);
    });
  });
});

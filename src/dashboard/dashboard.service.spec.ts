import { Test, TestingModule } from '@nestjs/testing'
import { InvoiceStatus, InvoiceType } from '../invoice/domain/invoice.entity'
import { MailService } from '../mail/mail.service'
import { OrderStatus } from '../order/domain/order.entity'
import { ResourceService } from '../resource/application/resource.service'
import { ResourceType } from '../resource/domain/resource.entity'
import { fakeCustomerServiceProviders } from '../test-utils/fake-customer'
import {
  FakeInvoiceRepository,
  fakeInvoiceServiceProviders,
} from '../test-utils/fake-invoice'
import {
  FakeOrderRepository,
  fakeOrderServiceProviders,
} from '../test-utils/fake-order'
import {
  FakeResourceRepository,
  fakeResourceServiceProviders,
} from '../test-utils/fake-resource'
import { mockFileStorageProvider } from '../test-utils/file-storage.mock'
import { DashboardService } from './dashboard.service'

describe('DashboardService (behavioural, fake repositories)', () => {
  let moduleRef: TestingModule
  let service: DashboardService
  let resources: ResourceService
  let resourcesFake: FakeResourceRepository
  let ordersFake: FakeOrderRepository
  let invoicesFake: FakeInvoiceRepository

  const businessA = 'biz-A'
  // Fixed "now" so date windows are deterministic.
  const now = new Date('2026-06-15T12:00:00.000Z')
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

  beforeAll(async () => {
    // Invoices, orders, and resources are all Postgres-backed via fakes.
    // OrderService also needs customer + resource fakes to construct.
    const fakeResources = fakeResourceServiceProviders()
    resourcesFake = fakeResources.resources
    const fakeOrders = fakeOrderServiceProviders()
    ordersFake = fakeOrders.orders
    const fakeInvoices = fakeInvoiceServiceProviders()
    invoicesFake = fakeInvoices.invoices
    const fakeCustomers = fakeCustomerServiceProviders()

    moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        ...fakeInvoices.providers,
        ...fakeOrders.providers,
        ...fakeResources.providers,
        ...fakeCustomers.providers,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendInvoice: jest.fn() } },
      ],
    }).compile()

    service = moduleRef.get(DashboardService)
    resources = moduleRef.get(ResourceService)
  })

  beforeEach(() => {
    invoicesFake._clear()
    ordersFake._clear()
    resourcesFake._clear()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  // Minimal invoice seed (only the fields the dashboard reads). Payment fields
  // aren't part of the create contract, so we set them on the stored row.
  async function seedInvoice(args: {
    amountPaid: number
    paymentDate?: Date | null
    status?: InvoiceStatus
    customerName?: string
  }) {
    const inv = await invoicesFake.create({
      businessId: businessA,
      orderIds: [],
      customerName: args.customerName ?? 'Ada',
      invoiceType: InvoiceType.STANDARD,
      subtotal: 100,
      vatRate: 0.15,
      vatAmount: 15,
      nhilRate: 0.025,
      nhilAmount: 2.5,
      getfundRate: 0.025,
      getfundAmount: 2.5,
      totalTax: 20,
      totalAmount: 120,
    })
    const stored = invoicesFake._get(inv.id)!
    stored.amountPaid = args.amountPaid
    stored.paymentDate = args.paymentDate ?? null
    stored.status = args.status ?? InvoiceStatus.PARTIALLY_PAID
    return stored
  }

  describe('revenue', () => {
    it('totals amountPaid and computes the 30d-vs-prior-30d trend', async () => {
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(10) }) // last 30
      await seedInvoice({ amountPaid: 50, paymentDate: daysAgo(20) }) // last 30
      await seedInvoice({ amountPaid: 60, paymentDate: daysAgo(45) }) // prior 30
      await seedInvoice({ amountPaid: 0, paymentDate: null }) // unpaid, ignored

      const summary = await service.getSummary(businessA, 30, now)

      expect(summary.revenue.total).toBe(210)
      expect(summary.revenue.last30Days).toBe(150)
      expect(summary.revenue.previous30Days).toBe(60)
      // (150 - 60) / 60 * 100 = 150%
      expect(summary.revenue.trendPercent).toBe(150)
    })

    it('trend is null when there was no prior-period revenue', async () => {
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(5) })
      const summary = await service.getSummary(businessA, 30, now)
      expect(summary.revenue.trendPercent).toBeNull()
    })
  })

  describe('inventory', () => {
    it('counts low-stock products by their own threshold', async () => {
      await resources.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Low',
        price: 1,
        availableQuantity: 2,
        lowStockThreshold: 5,
      })
      await resources.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Fine',
        price: 1,
        availableQuantity: 50,
        lowStockThreshold: 5,
      })
      // A service shouldn't count (services default to 0 stock, excluded).
      await resources.create(businessA, {
        type: ResourceType.SERVICE,
        name: 'Svc',
        price: 1,
      })

      const summary = await service.getSummary(businessA, 30, now)
      expect(summary.inventory.lowStockCount).toBe(1)
    })

    it('ranks top products by units sold across non-cancelled orders', async () => {
      const mkOrder = (
        resourceId: string,
        name: string,
        quantity: number,
        status = OrderStatus.COMPLETED,
      ) =>
        ordersFake.create({
          businessId: businessA,
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
        })

      await mkOrder('r1', 'Widget', 5)
      await mkOrder('r1', 'Widget', 3)
      await mkOrder('r2', 'Gadget', 2)
      await mkOrder('r3', 'Cancelled', 100, OrderStatus.CANCELLED) // excluded

      const summary = await service.getSummary(businessA, 30, now)
      expect(summary.inventory.topProducts[0]).toMatchObject({
        resourceId: 'r1',
        unitsSold: 8,
      })
      expect(
        summary.inventory.topProducts.find((p) => p.resourceId === 'r3'),
      ).toBeUndefined()
    })
  })

  describe('recent invoices + daily series', () => {
    it('returns the latest invoices and a daily revenue series', async () => {
      await seedInvoice({
        amountPaid: 100,
        paymentDate: daysAgo(1),
        customerName: 'First',
      })
      await seedInvoice({
        amountPaid: 200,
        paymentDate: daysAgo(2),
        customerName: 'Second',
      })

      const summary = await service.getSummary(businessA, 7, now)

      expect(summary.recentInvoices).toHaveLength(2)
      expect(summary.recentInvoices[0].customerName).toBeDefined()

      // Two distinct payment days -> two buckets.
      expect(summary.dailyRevenue).toHaveLength(2)
      const totalInSeries = summary.dailyRevenue.reduce(
        (s, d) => s + d.amount,
        0,
      )
      expect(totalInSeries).toBe(300)
    })

    it('limits daily series to the requested range', async () => {
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(2) }) // in 7d
      await seedInvoice({ amountPaid: 100, paymentDate: daysAgo(20) }) // outside 7d

      const summary = await service.getSummary(businessA, 7, now)
      expect(summary.dailyRevenue).toHaveLength(1)
    })
  })
})

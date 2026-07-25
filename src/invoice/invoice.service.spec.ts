import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { InvoiceService } from './application/invoice.service';
import { InvoiceStatus, PaymentMethod } from './domain/invoice.entity';
import {
  FakeInvoiceRepository,
  fakeInvoiceServiceProviders,
} from '../test-utils/fake-invoice';
import { OrderService } from '../order/application/order.service';
import {
  FakeOrderRepository,
  fakeOrderServiceProviders,
} from '../test-utils/fake-order';
import { CustomerService } from '../customer/application/customer.service';
import {
  FakeCustomerRepository,
  fakeCustomerServiceProviders,
} from '../test-utils/fake-customer';
import { ResourceService } from '../resource/application/resource.service';
import { ResourceType } from '../resource/domain/resource.entity';
import {
  FakeResourceRepository,
  fakeResourceServiceProviders,
} from '../test-utils/fake-resource';
import { MailService } from '../mail/mail.service';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';

/**
 * Behavioural spec for the Postgres-backed InvoiceService, run against in-memory
 * fakes of the invoice/order/customer/resource repositories. The real SQL path
 * (ILIKE search, revenue aggregations) is covered by the live smoke test.
 */
describe('InvoiceService (behavioural, fake repositories)', () => {
  let moduleRef: TestingModule;
  let invoices: InvoiceService;
  let invoicesFake: FakeInvoiceRepository;
  let orders: OrderService;
  let ordersFake: FakeOrderRepository;
  let customers: CustomerService;
  let customersFake: FakeCustomerRepository;
  let resources: ResourceService;
  let resourcesFake: FakeResourceRepository;
  const sendInvoice = jest.fn();

  const businessA = 'biz-A';

  beforeAll(async () => {
    const fakeInvoices = fakeInvoiceServiceProviders();
    invoicesFake = fakeInvoices.invoices;
    const fakeCustomers = fakeCustomerServiceProviders();
    customersFake = fakeCustomers.customers;
    const fakeResources = fakeResourceServiceProviders();
    resourcesFake = fakeResources.resources;
    const fakeOrders = fakeOrderServiceProviders();
    ordersFake = fakeOrders.orders;

    moduleRef = await Test.createTestingModule({
      providers: [
        ...fakeInvoices.providers,
        ...fakeOrders.providers,
        ...fakeCustomers.providers,
        ...fakeResources.providers,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendInvoice } },
      ],
    }).compile();

    invoices = moduleRef.get(InvoiceService);
    orders = moduleRef.get(OrderService);
    customers = moduleRef.get(CustomerService);
    resources = moduleRef.get(ResourceService);
  });

  beforeEach(() => {
    sendInvoice.mockClear();
    invoicesFake._clear();
    ordersFake._clear();
    customersFake._clear();
    resourcesFake._clear();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  /** Create a customer + a service-only order worth `amount`, return ids. */
  async function makeOrder(
    amount: number,
    customerId?: string,
  ): Promise<{ orderId: string; customerId: string }> {
    const cid =
      customerId ?? (await customers.create(businessA, { name: 'Ada' })).id;
    const service = await resources.create(businessA, {
      type: ResourceType.SERVICE,
      name: 'Svc',
      price: amount,
    });
    const order = await orders.create(businessA, {
      customerId: cid,
      items: [{ resourceId: service.id, quantity: 1 }],
    });
    return { orderId: order.id, customerId: cid };
  }

  describe('create', () => {
    it('computes the Ghana VAT breakdown and links the orders', async () => {
      const { orderId } = await makeOrder(100);

      const invoice = await invoices.create(businessA, { orderIds: [orderId] });

      expect(invoice.invoiceNumber).toMatch(/^VEN-/);
      expect(invoice.subtotal).toBe(100);
      expect(invoice.vatAmount).toBe(15); // 15%
      expect(invoice.nhilAmount).toBe(2.5); // 2.5%
      expect(invoice.getfundAmount).toBe(2.5); // 2.5%
      expect(invoice.totalTax).toBe(20);
      expect(invoice.totalAmount).toBe(120);
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);

      // Order is now linked to the invoice.
      const order = ordersFake._get(orderId);
      expect(order?.invoiceId).toBe(invoice.id);
    });

    it('sums multiple orders from the same customer', async () => {
      const { orderId: o1, customerId } = await makeOrder(100);
      const { orderId: o2 } = await makeOrder(50, customerId);

      const invoice = await invoices.create(businessA, {
        orderIds: [o1, o2],
      });
      expect(invoice.subtotal).toBe(150);
      expect(invoice.totalAmount).toBe(180); // +20%
    });

    it('rejects orders already on an invoice', async () => {
      const { orderId } = await makeOrder(100);
      await invoices.create(businessA, { orderIds: [orderId] });

      await expect(
        invoices.create(businessA, { orderIds: [orderId] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects orders from different customers on one invoice', async () => {
      const { orderId: o1 } = await makeOrder(100);
      const { orderId: o2 } = await makeOrder(50); // different customer

      await expect(
        invoices.create(businessA, { orderIds: [o1, o2] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when an order is not in the business', async () => {
      await expect(
        invoices.create(businessA, {
          orderIds: ['64b000000000000000000000'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recordPayment', () => {
    it('marks PARTIALLY_PAID then PAID across payments', async () => {
      const { orderId } = await makeOrder(100); // total 120
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });
      const id = invoice.id;

      let updated = await invoices.recordPayment(businessA, id, {
        amount: 50,
        paymentMethod: PaymentMethod.CASH,
      });
      expect(updated.amountPaid).toBe(50);
      expect(updated.status).toBe(InvoiceStatus.PARTIALLY_PAID);

      updated = await invoices.recordPayment(businessA, id, {
        amount: 70,
        paymentMethod: PaymentMethod.MOBILE_MONEY,
      });
      expect(updated.amountPaid).toBe(120);
      expect(updated.status).toBe(InvoiceStatus.PAID);
    });

    it('rejects overpayment', async () => {
      const { orderId } = await makeOrder(100); // total 120
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });

      await expect(
        invoices.recordPayment(businessA, invoice.id, {
          amount: 200,
          paymentMethod: PaymentMethod.CASH,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('send', () => {
    it('sets sentAt, moves DRAFT to SENT, and emails the customer', async () => {
      const cid = String(
        (
          await customers.create(businessA, {
            name: 'Ada',
            email: 'ada@example.com',
          })
        ).id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });

      const sent = await invoices.send(businessA, invoice.id, {});

      expect(sent.status).toBe(InvoiceStatus.SENT);
      expect(sent.sentAt).toBeInstanceOf(Date);
      expect(sendInvoice).toHaveBeenCalledTimes(1);
      expect(sendInvoice).toHaveBeenCalledWith(
        'ada@example.com',
        expect.objectContaining({ invoiceNumber: invoice.invoiceNumber }),
      );
    });

    it('overrides the recipient with dto.email', async () => {
      const cid = String(
        (
          await customers.create(businessA, {
            name: 'Ada',
            email: 'ada@example.com',
          })
        ).id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });

      await invoices.send(businessA, invoice.id, {
        email: 'override@example.com',
      });

      expect(sendInvoice).toHaveBeenCalledWith(
        'override@example.com',
        expect.any(Object),
      );
    });

    it('throws BadRequest when there is no recipient email', async () => {
      const { orderId } = await makeOrder(100); // customer has no email
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });

      await expect(
        invoices.send(businessA, invoice.id, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sendInvoice).not.toHaveBeenCalled();
    });

    it('does not downgrade a PAID invoice status', async () => {
      const cid = String(
        (
          await customers.create(businessA, {
            name: 'Ada',
            email: 'ada@example.com',
          })
        ).id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });
      await invoices.recordPayment(businessA, invoice.id, {
        amount: 120,
        paymentMethod: PaymentMethod.CASH,
      });

      const sent = await invoices.send(businessA, invoice.id, {});

      expect(sent.status).toBe(InvoiceStatus.PAID);
      expect(sent.sentAt).toBeInstanceOf(Date);
    });

    it('throws BadRequest when sending a cancelled invoice', async () => {
      const cid = String(
        (
          await customers.create(businessA, {
            name: 'Ada',
            email: 'ada@example.com',
          })
        ).id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });
      await invoices.updateStatus(
        businessA,
        invoice.id,
        InvoiceStatus.CANCELLED,
      );

      await expect(
        invoices.send(businessA, invoice.id, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sendInvoice).not.toHaveBeenCalled();
    });
  });

  describe('list / getById', () => {
    it('lists and filters by status', async () => {
      const { orderId } = await makeOrder(100);
      await invoices.create(businessA, { orderIds: [orderId] });

      const all = await invoices.list(businessA);
      expect(all.data).toHaveLength(1);
      expect(all.meta.total).toBe(1);

      const paid = await invoices.list(businessA, {
        status: InvoiceStatus.PAID,
      });
      expect(paid.data).toHaveLength(0);
      expect(paid.meta.total).toBe(0);
    });

    it('paginates invoices (page/limit/totalPages)', async () => {
      const { orderId: o1, customerId } = await makeOrder(100);
      const { orderId: o2 } = await makeOrder(50, customerId);
      const { orderId: o3 } = await makeOrder(25, customerId);
      await invoices.create(businessA, { orderIds: [o1] });
      await invoices.create(businessA, { orderIds: [o2] });
      await invoices.create(businessA, { orderIds: [o3] });

      const page1 = await invoices.list(businessA, { page: 1, limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.meta.total).toBe(3);
      expect(page1.meta.page).toBe(1);
      expect(page1.meta.limit).toBe(2);
      expect(page1.meta.totalPages).toBe(2);

      const page2 = await invoices.list(businessA, { page: 2, limit: 2 });
      expect(page2.data).toHaveLength(1);
      expect(page2.meta.page).toBe(2);
    });

    it('searches invoices by q (customerName, case-insensitive)', async () => {
      const { orderId } = await makeOrder(100); // customer named 'Ada'
      await invoices.create(businessA, { orderIds: [orderId] });

      const match = await invoices.list(businessA, { q: 'ada' });
      expect(match.data).toHaveLength(1);
      expect(match.data[0].customerName).toBe('Ada');

      const miss = await invoices.list(businessA, { q: 'zzz-none' });
      expect(miss.data).toHaveLength(0);
      expect(miss.meta.total).toBe(0);
    });

    it('throws NotFound for a missing invoice', async () => {
      await expect(
        invoices.getById(businessA, '64b000000000000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

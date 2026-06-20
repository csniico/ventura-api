import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Connection, Model } from 'mongoose';

import { InvoiceService } from './invoice.service';
import {
  Invoice,
  InvoiceDocument,
  InvoiceSchema,
  InvoiceStatus,
  PaymentMethod,
} from './schemas/invoice.schema';
import { OrderService } from '../order/order.service';
import {
  Order,
  OrderDocument,
  OrderSchema,
} from '../order/schemas/order.schema';
import { CustomerService } from '../customer/customer.service';
import {
  Customer,
  CustomerDocument,
  CustomerSchema,
} from '../customer/schemas/customer.schema';
import { ResourceService } from '../resource/resource.service';
import {
  Resource,
  ResourceDocument,
  ResourceSchema,
  ResourceType,
} from '../resource/schemas/resource.schema';
import { MailService } from '../mail/mail.service';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';
import { resolveTestUri } from '../test-utils/test-db';

describe('InvoiceService (integration)', () => {
  let moduleRef: TestingModule;
  let invoices: InvoiceService;
  let orders: OrderService;
  let customers: CustomerService;
  let resources: ResourceService;
  let invoiceModel: Model<InvoiceDocument>;
  let orderModel: Model<OrderDocument>;
  let customerModel: Model<CustomerDocument>;
  let resourceModel: Model<ResourceDocument>;
  let connection: Connection;
  const sendInvoice = jest.fn();

  const businessA = 'biz-A';

  beforeAll(async () => {
    const uri = resolveTestUri('invoice');

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Invoice.name, schema: InvoiceSchema },
          { name: Order.name, schema: OrderSchema },
          { name: Customer.name, schema: CustomerSchema },
          { name: Resource.name, schema: ResourceSchema },
        ]),
      ],
      providers: [
        InvoiceService,
        OrderService,
        CustomerService,
        ResourceService,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendInvoice } },
      ],
    }).compile();

    invoices = moduleRef.get(InvoiceService);
    orders = moduleRef.get(OrderService);
    customers = moduleRef.get(CustomerService);
    resources = moduleRef.get(ResourceService);
    invoiceModel = moduleRef.get(getModelToken(Invoice.name));
    orderModel = moduleRef.get(getModelToken(Order.name));
    customerModel = moduleRef.get(getModelToken(Customer.name));
    resourceModel = moduleRef.get(getModelToken(Resource.name));
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    sendInvoice.mockClear();
    await invoiceModel.deleteMany({});
    await orderModel.deleteMany({});
    await customerModel.deleteMany({});
    await resourceModel.deleteMany({});
  });

  afterAll(async () => {
    await invoiceModel.deleteMany({});
    await orderModel.deleteMany({});
    await customerModel.deleteMany({});
    await resourceModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  /** Create a customer + a service-only order worth `amount`, return ids. */
  async function makeOrder(
    amount: number,
    customerId?: string,
  ): Promise<{ orderId: string; customerId: string }> {
    const cid =
      customerId ??
      String((await customers.create(businessA, { name: 'Ada' }))._id);
    const service = await resources.create(businessA, {
      type: ResourceType.SERVICE,
      name: 'Svc',
      price: amount,
    });
    const order = await orders.create(businessA, {
      customerId: cid,
      items: [{ resourceId: String(service._id), quantity: 1 }],
    });
    return { orderId: String(order._id), customerId: cid };
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
      const order = await orderModel.findById(orderId).exec();
      expect(order?.invoiceId).toBe(String(invoice._id));
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
      const id = String(invoice._id);

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
        invoices.recordPayment(businessA, String(invoice._id), {
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
        )._id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });

      const sent = await invoices.send(businessA, String(invoice._id), {});

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
        )._id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });

      await invoices.send(businessA, String(invoice._id), {
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
        invoices.send(businessA, String(invoice._id), {}),
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
        )._id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });
      await invoices.recordPayment(businessA, String(invoice._id), {
        amount: 120,
        paymentMethod: PaymentMethod.CASH,
      });

      const sent = await invoices.send(businessA, String(invoice._id), {});

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
        )._id,
      );
      const { orderId } = await makeOrder(100, cid);
      const invoice = await invoices.create(businessA, { orderIds: [orderId] });
      await invoices.updateStatus(
        businessA,
        String(invoice._id),
        InvoiceStatus.CANCELLED,
      );

      await expect(
        invoices.send(businessA, String(invoice._id), {}),
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

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

import { OrderService } from './order.service';
import {
  Order,
  OrderDocument,
  OrderSchema,
  OrderStatus,
} from './schemas/order.schema';
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
import { FileStorageService } from '../file-storage/file-storage.service';
import { resolveTestUri } from '../test-utils/test-db';

describe('OrderService (integration)', () => {
  let moduleRef: TestingModule;
  let orders: OrderService;
  let customers: CustomerService;
  let resources: ResourceService;
  let orderModel: Model<OrderDocument>;
  let customerModel: Model<CustomerDocument>;
  let resourceModel: Model<ResourceDocument>;
  let connection: Connection;

  const businessA = 'biz-A';

  beforeAll(async () => {
    const uri = resolveTestUri('order');

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Order.name, schema: OrderSchema },
          { name: Customer.name, schema: CustomerSchema },
          { name: Resource.name, schema: ResourceSchema },
        ]),
      ],
      providers: [
        OrderService,
        CustomerService,
        ResourceService,
        {
          provide: FileStorageService,
          useValue: { deleteFile: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    orders = moduleRef.get(OrderService);
    customers = moduleRef.get(CustomerService);
    resources = moduleRef.get(ResourceService);
    orderModel = moduleRef.get<Model<OrderDocument>>(getModelToken(Order.name));
    customerModel = moduleRef.get<Model<CustomerDocument>>(
      getModelToken(Customer.name),
    );
    resourceModel = moduleRef.get<Model<ResourceDocument>>(
      getModelToken(Resource.name),
    );
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    await orderModel.deleteMany({});
    await customerModel.deleteMany({});
    await resourceModel.deleteMany({});
  });

  afterAll(async () => {
    await orderModel.deleteMany({});
    await customerModel.deleteMany({});
    await resourceModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  async function seedCustomer() {
    const c = await customers.create(businessA, { name: 'Ada' });
    return String(c._id);
  }
  async function seedProduct(qty: number, price = 10) {
    const p = await resources.create(businessA, {
      type: ResourceType.PRODUCT,
      name: 'Widget',
      price,
      availableQuantity: qty,
    });
    return String(p._id);
  }
  async function seedService(price = 50) {
    const s = await resources.create(businessA, {
      type: ResourceType.SERVICE,
      name: 'Haircut',
      price,
    });
    return String(s._id);
  }

  describe('create', () => {
    it('creates an order, snapshots customer + items, totals, decrements stock', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10, 10);

      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 3 }],
      });

      expect(order.orderNumber).toMatch(/^ORD-/);
      expect(order.customerName).toBe('Ada');
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.totalAmount).toBe(30);
      expect(order.items[0].name).toBe('Widget');
      expect(order.items[0].subTotal).toBe(30);

      // Stock decremented 10 -> 7.
      const product = await resourceModel.findById(productId).exec();
      expect(product?.availableQuantity).toBe(7);
    });

    it('does not decrement stock for service items', async () => {
      const customerId = await seedCustomer();
      const serviceId = await seedService(50);

      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: serviceId, quantity: 2 }],
      });
      expect(order.totalAmount).toBe(100);
    });

    it('rejects when product stock is insufficient (and leaves stock intact)', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(2);

      await expect(
        orders.create(businessA, {
          customerId,
          items: [{ resourceId: productId, quantity: 5 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      const product = await resourceModel.findById(productId).exec();
      expect(product?.availableQuantity).toBe(2);
      expect(await orderModel.countDocuments()).toBe(0);
    });

    it('rolls back earlier decrements when a later item is short', async () => {
      const customerId = await seedCustomer();
      const ok = await seedProduct(10); // plenty
      const short = await seedProduct(1); // not enough

      await expect(
        orders.create(businessA, {
          customerId,
          items: [
            { resourceId: ok, quantity: 3 },
            { resourceId: short, quantity: 5 },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      // The first product's stock was restored.
      const okProduct = await resourceModel.findById(ok).exec();
      expect(okProduct?.availableQuantity).toBe(10);
    });

    it('throws NotFound when the customer is not in the business', async () => {
      const productId = await seedProduct(5);
      await expect(
        orders.create(businessA, {
          customerId: '64b000000000000000000000',
          items: [{ resourceId: productId, quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list / getById', () => {
    it('lists and filters by status', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10);
      const o1 = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 1 }],
      });
      await orders.updateStatus(
        businessA,
        String(o1._id),
        OrderStatus.COMPLETED,
      );
      await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 1 }],
      });

      const all = await orders.list(businessA);
      expect(all.data).toHaveLength(2);
      expect(all.meta.total).toBe(2);

      const completed = await orders.list(businessA, {
        status: OrderStatus.COMPLETED,
      });
      expect(completed.data).toHaveLength(1);
      expect(completed.meta.total).toBe(1);
    });

    it('paginates orders (page/limit/totalPages)', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10);
      for (let i = 0; i < 3; i++) {
        await orders.create(businessA, {
          customerId,
          items: [{ resourceId: productId, quantity: 1 }],
        });
      }

      const page1 = await orders.list(businessA, { page: 1, limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.meta.total).toBe(3);
      expect(page1.meta.page).toBe(1);
      expect(page1.meta.limit).toBe(2);
      expect(page1.meta.totalPages).toBe(2);

      const page2 = await orders.list(businessA, { page: 2, limit: 2 });
      expect(page2.data).toHaveLength(1);
      expect(page2.meta.page).toBe(2);
    });

    it('searches orders by q (customerName, case-insensitive)', async () => {
      const customerId = await seedCustomer(); // customer named 'Ada'
      const productId = await seedProduct(10);
      await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 1 }],
      });

      const match = await orders.list(businessA, { q: 'ada' });
      expect(match.data).toHaveLength(1);
      expect(match.data[0].customerName).toBe('Ada');

      const miss = await orders.list(businessA, { q: 'zzz-none' });
      expect(miss.data).toHaveLength(0);
      expect(miss.meta.total).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('cancelling restores product stock', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10);
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 4 }],
      });
      // 10 -> 6 after order.
      await orders.updateStatus(
        businessA,
        String(order._id),
        OrderStatus.CANCELLED,
      );

      const product = await resourceModel.findById(productId).exec();
      expect(product?.availableQuantity).toBe(10);
    });

    it('rejects changing status of a cancelled order', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10);
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 1 }],
      });
      await orders.updateStatus(
        businessA,
        String(order._id),
        OrderStatus.CANCELLED,
      );

      await expect(
        orders.updateStatus(
          businessA,
          String(order._id),
          OrderStatus.COMPLETED,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateItems', () => {
    it('increasing quantity decrements stock by the delta', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10, 10); // stock 10
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 3 }],
      });
      // 10 -> 7 after create.

      const updated = await orders.updateItems(businessA, String(order._id), [
        { resourceId: productId, quantity: 5 },
      ]);

      expect(updated.items[0].quantity).toBe(5);
      const product = await resourceModel.findById(productId).exec();
      // delta +2 decremented: 7 -> 5.
      expect(product?.availableQuantity).toBe(5);
    });

    it('decreasing quantity restores stock by the delta', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10, 10);
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 5 }],
      });
      // 10 -> 5 after create.

      await orders.updateItems(businessA, String(order._id), [
        { resourceId: productId, quantity: 2 },
      ]);

      const product = await resourceModel.findById(productId).exec();
      // delta -3 restored: 5 -> 8.
      expect(product?.availableQuantity).toBe(8);
    });

    it('adding a new product line decrements its stock', async () => {
      const customerId = await seedCustomer();
      const productA = await seedProduct(10, 10);
      const productB = await seedProduct(10, 20);
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productA, quantity: 2 }],
      });

      await orders.updateItems(businessA, String(order._id), [
        { resourceId: productA, quantity: 2 },
        { resourceId: productB, quantity: 4 },
      ]);

      const pA = await resourceModel.findById(productA).exec();
      const pB = await resourceModel.findById(productB).exec();
      expect(pA?.availableQuantity).toBe(8); // unchanged
      expect(pB?.availableQuantity).toBe(6); // 10 -> 6
    });

    it('removing a product line restores its stock', async () => {
      const customerId = await seedCustomer();
      const productA = await seedProduct(10, 10);
      const productB = await seedProduct(10, 20);
      const order = await orders.create(businessA, {
        customerId,
        items: [
          { resourceId: productA, quantity: 2 },
          { resourceId: productB, quantity: 4 },
        ],
      });
      // A: 10->8, B: 10->6.

      await orders.updateItems(businessA, String(order._id), [
        { resourceId: productA, quantity: 2 },
      ]);

      const pA = await resourceModel.findById(productA).exec();
      const pB = await resourceModel.findById(productB).exec();
      expect(pA?.availableQuantity).toBe(8); // unchanged
      expect(pB?.availableQuantity).toBe(10); // fully restored
    });

    it('recomputes totalAmount', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10, 10);
      const serviceId = await seedService(50);
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 1 }],
      });
      expect(order.totalAmount).toBe(10);

      const updated = await orders.updateItems(businessA, String(order._id), [
        { resourceId: productId, quantity: 2 },
        { resourceId: serviceId, quantity: 3 },
      ]);

      // 2*10 + 3*50 = 170.
      expect(updated.totalAmount).toBe(170);
    });

    it('rejects editing a non-pending order', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(10, 10);
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 1 }],
      });
      await orders.updateStatus(
        businessA,
        String(order._id),
        OrderStatus.COMPLETED,
      );

      await expect(
        orders.updateItems(businessA, String(order._id), [
          { resourceId: productId, quantity: 2 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws Conflict on insufficient stock increase and leaves stock unchanged', async () => {
      const customerId = await seedCustomer();
      const productId = await seedProduct(5, 10); // stock 5
      const order = await orders.create(businessA, {
        customerId,
        items: [{ resourceId: productId, quantity: 3 }],
      });
      // 5 -> 2 after create.

      await expect(
        orders.updateItems(businessA, String(order._id), [
          { resourceId: productId, quantity: 10 },
        ]),
      ).rejects.toBeInstanceOf(ConflictException);

      const product = await resourceModel.findById(productId).exec();
      // delta +7 needed but only 2 available -> unchanged at 2.
      expect(product?.availableQuantity).toBe(2);
    });
  });
});

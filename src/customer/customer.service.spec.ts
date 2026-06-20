import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';

import { CustomerService } from './customer.service';
import {
  Customer,
  CustomerDocument,
  CustomerSchema,
} from './schemas/customer.schema';
import { resolveTestUri } from '../test-utils/test-db';

describe('CustomerService (integration)', () => {
  let moduleRef: TestingModule;
  let service: CustomerService;
  let customerModel: Model<CustomerDocument>;
  let connection: Connection;

  const businessA = 'biz-A';
  const businessB = 'biz-B';

  beforeAll(async () => {
    const uri = resolveTestUri('customer');

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Customer.name, schema: CustomerSchema },
        ]),
      ],
      providers: [CustomerService],
    }).compile();

    service = moduleRef.get(CustomerService);
    customerModel = moduleRef.get<Model<CustomerDocument>>(
      getModelToken(Customer.name),
    );
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    await customerModel.deleteMany({});
  });

  afterAll(async () => {
    await customerModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  describe('create', () => {
    it('creates with only a name', async () => {
      const c = await service.create(businessA, { name: 'Ada' });
      expect(c.name).toBe('Ada');
      expect(c.businessId).toBe(businessA);
      expect(c.shortId).toHaveLength(8);
    });

    it('stores optional fields', async () => {
      const c = await service.create(businessA, {
        name: 'Grace',
        email: 'grace@example.com',
        phone: '+233200000000',
        notes: 'VIP',
      });
      expect(c.email).toBe('grace@example.com');
      expect(c.phone).toBe('+233200000000');
      expect(c.notes).toBe('VIP');
    });

    it('rejects a duplicate email within the same business', async () => {
      await service.create(businessA, { name: 'A', email: 'dupe@example.com' });
      await expect(
        service.create(businessA, { name: 'B', email: 'dupe@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows the same email in a different business', async () => {
      await service.create(businessA, { name: 'A', email: 'x@example.com' });
      const c = await service.create(businessB, {
        name: 'B',
        email: 'x@example.com',
      });
      expect(c.businessId).toBe(businessB);
    });
  });

  describe('bulkCreate', () => {
    it('creates all valid, unique contacts', async () => {
      const res = await service.bulkCreate(businessA, [
        { name: 'One', email: 'one@example.com' },
        { name: 'Two', phone: '123' },
        { name: 'Three' },
      ]);
      expect(res.created).toHaveLength(3);
      expect(res.skipped).toHaveLength(0);
      expect(res.failed).toHaveLength(0);
      expect(
        await customerModel.countDocuments({ businessId: businessA }),
      ).toBe(3);
    });

    it('skips duplicates by email (existing and within the batch)', async () => {
      await service.create(businessA, {
        name: 'Existing',
        email: 'taken@example.com',
      });

      const res = await service.bulkCreate(businessA, [
        { name: 'Dup of existing', email: 'taken@example.com' },
        { name: 'New', email: 'fresh@example.com' },
        { name: 'Dup in batch', email: 'fresh@example.com' },
      ]);

      expect(res.created).toHaveLength(1);
      expect(res.skipped).toHaveLength(2);
    });

    it('always inserts contacts with no email (phone-only)', async () => {
      const res = await service.bulkCreate(businessA, [
        { name: 'NoEmail1' },
        { name: 'NoEmail2' },
        { name: 'NoEmail3', phone: '999' },
      ]);
      expect(res.created).toHaveLength(3);
    });
  });

  describe('list / getById / delete', () => {
    it('lists only the business own customers (paginated envelope)', async () => {
      await service.create(businessA, { name: 'A1' });
      await service.create(businessA, { name: 'A2' });
      await service.create(businessB, { name: 'B1' });

      const result = await service.list(businessA);
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('paginates and searches by q', async () => {
      await service.create(businessA, { name: 'Alice', email: 'alice@x.com' });
      await service.create(businessA, { name: 'Bob', email: 'bob@x.com' });
      await service.create(businessA, { name: 'Carol' });

      const page1 = await service.list(businessA, { page: 1, limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.meta.total).toBe(3);
      expect(page1.meta.totalPages).toBe(2);

      const search = await service.list(businessA, { q: 'alice' });
      expect(search.data).toHaveLength(1);
      expect(search.data[0].name).toBe('Alice');
    });

    it('gets a customer by id within the business', async () => {
      const c = await service.create(businessA, { name: 'Find' });
      const found = await service.getById(businessA, String(c._id));
      expect(found.name).toBe('Find');
    });

    it('does not return a customer from another business (NotFound)', async () => {
      const c = await service.create(businessA, { name: 'Hidden' });
      await expect(
        service.getById(businessB, String(c._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes a customer', async () => {
      const c = await service.create(businessA, { name: 'Bye' });
      await service.delete(businessA, String(c._id));
      expect(await customerModel.countDocuments()).toBe(0);
    });

    it('cannot delete a customer from another business (NotFound)', async () => {
      const c = await service.create(businessA, { name: 'Safe' });
      await expect(
        service.delete(businessB, String(c._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await customerModel.countDocuments()).toBe(1);
    });

    it('throws NotFound deleting a missing customer', async () => {
      const missing = new Types.ObjectId().toString();
      await expect(service.delete(businessA, missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';

import { SearchService } from './search.service';
import { CustomerService } from '../customer/customer.service';
import {
  Customer,
  CustomerDocument,
  CustomerSchema,
} from '../customer/schemas/customer.schema';
import { ResourceService } from '../resource/resource.service';
import {
  Resource,
  ResourceSchema,
  ResourceType,
} from '../resource/schemas/resource.schema';
import { OrderService } from '../order/order.service';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { InvoiceService } from '../invoice/invoice.service';
import { Invoice, InvoiceSchema } from '../invoice/schemas/invoice.schema';
import { AppointmentService } from '../appointment/appointment.service';
import {
  Appointment,
  AppointmentSchema,
} from '../appointment/schemas/appointment.schema';
import { resolveTestUri } from '../test-utils/test-db';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';
import { MailService } from '../mail/mail.service';

describe('SearchService (integration)', () => {
  let moduleRef: TestingModule;
  let search: SearchService;
  let customers: CustomerService;
  let resources: ResourceService;
  let customerModel: Model<CustomerDocument>;
  let connection: Connection;

  const businessA = 'biz-A';

  beforeAll(async () => {
    const uri = resolveTestUri('search');

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Customer.name, schema: CustomerSchema },
          { name: Resource.name, schema: ResourceSchema },
          { name: Order.name, schema: OrderSchema },
          { name: Invoice.name, schema: InvoiceSchema },
          { name: Appointment.name, schema: AppointmentSchema },
        ]),
      ],
      providers: [
        SearchService,
        CustomerService,
        ResourceService,
        OrderService,
        InvoiceService,
        AppointmentService,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendInvoice: jest.fn() } },
      ],
    }).compile();

    search = moduleRef.get(SearchService);
    customers = moduleRef.get(CustomerService);
    resources = moduleRef.get(ResourceService);
    customerModel = moduleRef.get(getModelToken(Customer.name));
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    await connection.dropDatabase();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
    await moduleRef.close();
  });

  it('returns empty groups for an empty query without hitting the db', async () => {
    const results = await search.search(businessA, '   ');
    expect(results.customers).toHaveLength(0);
    expect(results.resources).toHaveLength(0);
    expect(results.orders).toHaveLength(0);
    expect(results.invoices).toHaveLength(0);
    expect(results.appointments).toHaveLength(0);
  });

  it('finds matches across customers and resources', async () => {
    await customers.create(businessA, { name: 'Acme Holdings' });
    await customers.create(businessA, { name: 'Other Co' });
    await resources.create(businessA, {
      type: ResourceType.PRODUCT,
      name: 'Acme Widget',
      price: 9.99,
    });

    const results = await search.search(businessA, 'acme');
    expect(results.customers).toHaveLength(1);
    expect(results.resources).toHaveLength(1);
    expect((results.customers[0] as { name: string }).name).toBe(
      'Acme Holdings',
    );
  });

  it('scopes results to the caller business', async () => {
    await customers.create(businessA, { name: 'Acme A' });
    await customers.create('biz-B', { name: 'Acme B' });

    const results = await search.search(businessA, 'acme');
    expect(results.customers).toHaveLength(1);
  });

  it('caps each group to 5 results', async () => {
    for (let i = 0; i < 8; i++) {
      await customerModel.create({ businessId: businessA, name: `Match ${i}` });
    }
    const results = await search.search(businessA, 'Match');
    expect(results.customers).toHaveLength(5);
  });
});

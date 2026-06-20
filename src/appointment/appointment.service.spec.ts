import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';

import { AppointmentService } from './appointment.service';
import {
  Appointment,
  AppointmentDocument,
  AppointmentSchema,
  RecurrenceFrequency,
} from './schemas/appointment.schema';
import { CustomerService } from '../customer/customer.service';
import {
  Customer,
  CustomerDocument,
  CustomerSchema,
} from '../customer/schemas/customer.schema';
import { resolveTestUri } from '../test-utils/test-db';

describe('AppointmentService (integration)', () => {
  let moduleRef: TestingModule;
  let service: AppointmentService;
  let customers: CustomerService;
  let appointmentModel: Model<AppointmentDocument>;
  let customerModel: Model<CustomerDocument>;
  let connection: Connection;

  const businessId = 'biz-appt';
  const createdBy = 'user-1';
  const future = (mins: number) =>
    new Date(Date.now() + mins * 60000).toISOString();

  beforeAll(async () => {
    const uri = resolveTestUri('appointment');

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Appointment.name, schema: AppointmentSchema },
          { name: Customer.name, schema: CustomerSchema },
        ]),
      ],
      providers: [AppointmentService, CustomerService],
    }).compile();

    service = moduleRef.get(AppointmentService);
    customers = moduleRef.get(CustomerService);
    appointmentModel = moduleRef.get<Model<AppointmentDocument>>(
      getModelToken(Appointment.name),
    );
    customerModel = moduleRef.get<Model<CustomerDocument>>(
      getModelToken(Customer.name),
    );
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    await appointmentModel.deleteMany({});
    await customerModel.deleteMany({});
  });

  afterAll(async () => {
    await appointmentModel.deleteMany({});
    await customerModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  describe('create', () => {
    it('creates a one-off appointment with required fields', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Consultation',
        start: future(60),
        end: future(120),
      });
      expect(appt.title).toBe('Consultation');
      expect(appt.businessId).toBe(businessId);
      expect(appt.createdBy).toBe(createdBy);
      expect(appt.recurrence == null).toBe(true);
      expect(appt.invitees).toEqual([]);
    });

    it('stores a recurrence rule', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Weekly standup',
        start: future(60),
        end: future(90),
        recurrence: { frequency: RecurrenceFrequency.WEEKLY, interval: 2 },
      });
      expect(appt.recurrence?.frequency).toBe(RecurrenceFrequency.WEEKLY);
      expect(appt.recurrence?.interval).toBe(2);
    });

    it('rejects when end is not after start', async () => {
      await expect(
        service.create(businessId, createdBy, {
          title: 'Bad',
          start: future(120),
          end: future(60),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts an invitee that references a real customer', async () => {
      const customer = await customers.create(businessId, { name: 'Ada' });
      const appt = await service.create(businessId, createdBy, {
        title: 'With customer',
        start: future(60),
        end: future(120),
        invitees: [{ name: 'Ada', customerId: String(customer._id) }],
      });
      expect(appt.invitees).toHaveLength(1);
    });

    it('accepts ad-hoc (email-only) invitees', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'External',
        start: future(60),
        end: future(120),
        invitees: [{ name: 'Guest', email: 'guest@example.com' }],
      });
      expect(appt.invitees[0].email).toBe('guest@example.com');
    });

    it('rejects an invitee referencing a customer not in the business', async () => {
      const missing = new Types.ObjectId().toString();
      await expect(
        service.create(businessId, createdBy, {
          title: 'Bad invitee',
          start: future(60),
          end: future(120),
          invitees: [{ name: 'Ghost', customerId: missing }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('list / getById', () => {
    it('lists only the business appointments, soonest first', async () => {
      await service.create(businessId, createdBy, {
        title: 'Later',
        start: future(180),
        end: future(200),
      });
      await service.create(businessId, createdBy, {
        title: 'Sooner',
        start: future(60),
        end: future(90),
      });
      await service.create('other-biz', createdBy, {
        title: 'Other',
        start: future(60),
        end: future(90),
      });

      const list = await service.list(businessId);
      expect(list).toHaveLength(2);
      expect(list[0].title).toBe('Sooner');
    });

    it('does not return an appointment from another business', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Hidden',
        start: future(60),
        end: future(120),
      });
      await expect(
        service.getById('other-biz', String(appt._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update / delete', () => {
    it('updates fields and clears recurrence', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Repeats',
        start: future(60),
        end: future(120),
        recurrence: { frequency: RecurrenceFrequency.DAILY },
      });

      const updated = await service.update(businessId, String(appt._id), {
        title: 'No longer repeats',
        clearRecurrence: true,
      });
      expect(updated.title).toBe('No longer repeats');
      expect(updated.recurrence == null).toBe(true);
    });

    it('rejects an update that makes end <= start', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'A',
        start: future(60),
        end: future(120),
      });
      await expect(
        service.update(businessId, String(appt._id), { end: future(30) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes an appointment', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Bye',
        start: future(60),
        end: future(120),
      });
      await service.delete(businessId, String(appt._id));
      expect(await appointmentModel.countDocuments()).toBe(0);
    });

    it('cannot delete an appointment from another business', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Safe',
        start: future(60),
        end: future(120),
      });
      await expect(
        service.delete('other-biz', String(appt._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

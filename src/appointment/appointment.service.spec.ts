import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AppointmentService } from './application/appointment.service';
import {
  AppointmentStatus,
  RecurrenceFrequency,
} from './domain/appointment.entity';
import { CustomerService } from '../customer/application/customer.service';
import {
  FakeCustomerRepository,
  fakeCustomerServiceProviders,
} from '../test-utils/fake-customer';
import {
  FakeAppointmentRepository,
  fakeAppointmentServiceProviders,
} from '../test-utils/fake-appointment';

describe('AppointmentService', () => {
  let moduleRef: TestingModule;
  let service: AppointmentService;
  let customers: CustomerService;
  let customersFake: FakeCustomerRepository;
  let appointmentsFake: FakeAppointmentRepository;

  const businessId = 'biz-appt';
  const createdBy = 'user-1';
  const future = (mins: number) =>
    new Date(Date.now() + mins * 60000).toISOString();

  beforeAll(async () => {
    const fakeCustomers = fakeCustomerServiceProviders();
    customersFake = fakeCustomers.customers;
    const fakeAppointments = fakeAppointmentServiceProviders();
    appointmentsFake = fakeAppointments.appointments;

    moduleRef = await Test.createTestingModule({
      providers: [...fakeAppointments.providers, ...fakeCustomers.providers],
    }).compile();

    service = moduleRef.get(AppointmentService);
    customers = moduleRef.get(CustomerService);
  });

  beforeEach(() => {
    appointmentsFake._clear();
    customersFake._clear();
  });

  afterAll(async () => {
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
        invitees: [{ name: 'Ada', customerId: customer.id }],
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
      await expect(
        service.create(businessId, createdBy, {
          title: 'Bad invitee',
          start: future(60),
          end: future(120),
          invitees: [{ name: 'Ghost', customerId: 'missing-customer-id' }],
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
        service.getById('other-biz', appt.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('search', () => {
    it('finds a business appointment by title, soonest first', async () => {
      await service.create(businessId, createdBy, {
        title: 'Dentist checkup',
        start: future(180),
        end: future(200),
      });
      await service.create(businessId, createdBy, {
        title: 'Dentist cleaning',
        start: future(60),
        end: future(90),
      });
      const results = await service.search(businessId, 'dentist');
      expect(results.map((a) => a.title)).toEqual([
        'Dentist cleaning',
        'Dentist checkup',
      ]);
    });

    it('returns nothing for an empty query', async () => {
      await service.create(businessId, createdBy, {
        title: 'Anything',
        start: future(60),
        end: future(90),
      });
      expect(await service.search(businessId, '   ')).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('sets the status of a business appointment', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Track me',
        start: future(60),
        end: future(120),
      });
      const updated = await service.updateStatus(
        businessId,
        appt.id,
        AppointmentStatus.COMPLETED,
      );
      expect(updated.status).toBe(AppointmentStatus.COMPLETED);
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

      const updated = await service.update(businessId, appt.id, {
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
        service.update(businessId, appt.id, { end: future(30) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes an appointment', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Bye',
        start: future(60),
        end: future(120),
      });
      await service.delete(businessId, appt.id);
      expect(appointmentsFake._count()).toBe(0);
    });

    it('cannot delete an appointment from another business', async () => {
      const appt = await service.create(businessId, createdBy, {
        title: 'Safe',
        start: future(60),
        end: future(120),
      });
      await expect(service.delete('other-biz', appt.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

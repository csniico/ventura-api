import { Test, TestingModule } from '@nestjs/testing'
import { CustomerService } from '../customer/application/customer.service'
import { MailService } from '../mail/mail.service'
import { ResourceService } from '../resource/application/resource.service'
import { ResourceType } from '../resource/domain/resource.entity'
import {
  FakeAppointmentRepository,
  fakeAppointmentServiceProviders,
} from '../test-utils/fake-appointment'
import {
  FakeCustomerRepository,
  fakeCustomerServiceProviders,
} from '../test-utils/fake-customer'
import { fakeInvoiceServiceProviders } from '../test-utils/fake-invoice'
import { fakeOrderServiceProviders } from '../test-utils/fake-order'
import {
  FakeResourceRepository,
  fakeResourceServiceProviders,
} from '../test-utils/fake-resource'
import { mockFileStorageProvider } from '../test-utils/file-storage.mock'
import { SearchService } from './search.service'

describe('SearchService', () => {
  let moduleRef: TestingModule
  let search: SearchService
  let customers: CustomerService
  let customersFake: FakeCustomerRepository
  let resources: ResourceService
  let resourcesFake: FakeResourceRepository
  let appointmentsFake: FakeAppointmentRepository

  const businessA = 'biz-A'

  beforeAll(async () => {
    // Every searchable entity is Postgres-backed via in-memory fakes.
    const fakeCustomers = fakeCustomerServiceProviders()
    customersFake = fakeCustomers.customers
    const fakeResources = fakeResourceServiceProviders()
    resourcesFake = fakeResources.resources
    const fakeOrders = fakeOrderServiceProviders()
    const fakeInvoices = fakeInvoiceServiceProviders()
    const fakeAppointments = fakeAppointmentServiceProviders()
    appointmentsFake = fakeAppointments.appointments

    moduleRef = await Test.createTestingModule({
      providers: [
        SearchService,
        ...fakeCustomers.providers,
        ...fakeResources.providers,
        ...fakeOrders.providers,
        ...fakeInvoices.providers,
        ...fakeAppointments.providers,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendInvoice: jest.fn() } },
      ],
    }).compile()

    search = moduleRef.get(SearchService)
    customers = moduleRef.get(CustomerService)
    resources = moduleRef.get(ResourceService)
  })

  beforeEach(() => {
    customersFake._clear()
    resourcesFake._clear()
    appointmentsFake._clear()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  it('returns empty groups for an empty query without hitting the db', async () => {
    const results = await search.search(businessA, '   ')
    expect(results.customers).toHaveLength(0)
    expect(results.resources).toHaveLength(0)
    expect(results.orders).toHaveLength(0)
    expect(results.invoices).toHaveLength(0)
    expect(results.appointments).toHaveLength(0)
  })

  it('finds matches across customers, resources and appointments', async () => {
    await customers.create(businessA, { name: 'Acme Holdings' })
    await customers.create(businessA, { name: 'Other Co' })
    await resources.create(businessA, {
      type: ResourceType.PRODUCT,
      name: 'Acme Widget',
      price: 9.99,
    })
    await appointmentsFake.create({
      businessId: businessA,
      createdBy: 'user-1',
      title: 'Acme kickoff',
      start: new Date(Date.now() + 3600000),
      end: new Date(Date.now() + 7200000),
      invitees: [],
    })

    const results = await search.search(businessA, 'acme')
    expect(results.customers).toHaveLength(1)
    expect(results.resources).toHaveLength(1)
    expect(results.appointments).toHaveLength(1)
    expect((results.customers[0] as { name: string }).name).toBe(
      'Acme Holdings',
    )
  })

  it('scopes results to the caller business', async () => {
    await customers.create(businessA, { name: 'Acme A' })
    await customers.create('biz-B', { name: 'Acme B' })

    const results = await search.search(businessA, 'acme')
    expect(results.customers).toHaveLength(1)
  })

  it('caps each group to 5 results', async () => {
    for (let i = 0; i < 8; i++) {
      await customers.create(businessA, { name: `Match ${i}` })
    }
    const results = await search.search(businessA, 'Match')
    expect(results.customers).toHaveLength(5)
  })
})

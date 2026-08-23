import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { Test, TestingModule } from '@nestjs/testing'
import { MailService } from '../mail/mail.service'
import { FakeBusinessRepository } from '../test-utils/fake-business'
import {
  FakeUserRepository,
  fakeUserServiceProviders,
} from '../test-utils/fake-user'
import { mockFileStorageProvider } from '../test-utils/file-storage.mock'
import { UserServiceV2 } from '../user/application/user.service'
import { BusinessService } from './application/business.service'
import { BUSINESS_DATA_SOURCE } from './domain/business.repository'

/**
 * Behavioural spec for the Postgres-backed BusinessService. Both the business
 * and user repositories are in-memory fakes (the repository pattern makes this
 * DB-free); the real SQL path is covered by the live smoke test.
 */
describe('BusinessService (behavioural, fake repositories)', () => {
  let moduleRef: TestingModule
  let business: BusinessService
  let users: UserServiceV2
  let usersFake: FakeUserRepository
  let businessFake: FakeBusinessRepository

  const MISSING = '10000000-0000-4000-8000-999999999999'

  beforeAll(async () => {
    const fakeUsers = fakeUserServiceProviders()
    usersFake = fakeUsers.users
    businessFake = new FakeBusinessRepository()

    moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        BusinessService,
        { provide: BUSINESS_DATA_SOURCE, useValue: businessFake },
        ...fakeUsers.providers,
        mockFileStorageProvider,
        { provide: MailService, useValue: { sendVerificationCode: jest.fn() } },
      ],
    }).compile()

    business = moduleRef.get(BusinessService)
    users = moduleRef.get(UserServiceV2)
  })

  beforeEach(() => {
    businessFake._clear()
    usersFake._clear()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  async function makeOwner(email = 'owner@example.com'): Promise<string> {
    const user = await users.createWithEmail({ firstName: 'Owner', email })
    return user.id
  }

  it('exposes suggested categories', () => {
    const cats = business.getCategories()
    expect(cats).toContain('tech')
    expect(cats).toContain('beauty')
  })

  describe('create', () => {
    it('creates with only a name and links the owner', async () => {
      const ownerId = await makeOwner()
      const created = await business.create(ownerId, { name: 'Acme' })

      expect(created.name).toBe('Acme')
      expect(created.ownerId).toBe(ownerId)
      expect(created.shortId).toHaveLength(8)
      expect(created.categories).toEqual([])

      // Owner's user was linked.
      expect(usersFake._get(ownerId)?.businessId).toBe(created.id)
    })

    it('stores name and custom categories on create', async () => {
      const ownerId = await makeOwner()
      const created = await business.create(ownerId, {
        name: 'Beauty Co',
        categories: ['beauty', 'custom-niche'],
      })

      expect(created.name).toBe('Beauty Co')
      expect(created.categories).toEqual(['beauty', 'custom-niche'])
      // Other properties are unset on create — added later via update.
      expect(created.description == null).toBe(true)
    })

    it('rejects a second business for the same owner and leaves no orphan', async () => {
      const ownerId = await makeOwner()
      await business.create(ownerId, { name: 'First' })

      await expect(
        business.create(ownerId, { name: 'Second' }),
      ).rejects.toBeInstanceOf(ConflictException)

      // Only the first business exists (the orphan was rolled back).
      expect(businessFake._count()).toBe(1)
    })
  })

  describe('getById / getByOwner', () => {
    it('gets a business by id', async () => {
      const ownerId = await makeOwner()
      const created = await business.create(ownerId, { name: 'Acme' })

      const found = await business.getById(created.id)
      expect(found.name).toBe('Acme')
    })

    it('throws NotFound for a missing id', async () => {
      await expect(business.getById(MISSING)).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    it('gets the business by owner, or null when none', async () => {
      const ownerId = await makeOwner()
      expect(await business.getByOwner(ownerId)).toBeNull()

      await business.create(ownerId, { name: 'Acme' })
      const found = await business.getByOwner(ownerId)
      expect(found!.name).toBe('Acme')
    })
  })

  describe('update', () => {
    it('updates fields for the owner', async () => {
      const ownerId = await makeOwner()
      const created = await business.create(ownerId, { name: 'Acme' })

      const updated = await business.update(created.id, ownerId, {
        name: 'Acme Inc',
        tagLine: 'We build things',
      })

      expect(updated.name).toBe('Acme Inc')
      expect(updated.tagLine).toBe('We build things')
    })

    it('updates properties individually, leaving others untouched', async () => {
      const ownerId = await makeOwner()
      const created = await business.create(ownerId, {
        name: 'Acme',
        categories: ['tech'],
      })
      const id = created.id

      // Each call sends only the one field the user changed.
      await business.update(id, ownerId, { description: 'We build things' })
      await business.update(id, ownerId, { phone: '+233200000000' })
      await business.update(id, ownerId, {
        businessHours: { monday: { open: '09:00', close: '17:00' } },
      })

      const fromDb = businessFake._get(id)
      expect(fromDb?.description).toBe('We build things')
      expect(fromDb?.phone).toBe('+233200000000')
      expect(fromDb?.businessHours?.monday.open).toBe('09:00')
      // Untouched fields kept their original values.
      expect(fromDb?.name).toBe('Acme')
      expect(fromDb?.categories).toEqual(['tech'])
    })

    it('forbids updating a business the caller does not own', async () => {
      const ownerId = await makeOwner('a@example.com')
      const otherId = await makeOwner('b@example.com')
      const created = await business.create(ownerId, { name: 'Acme' })

      await expect(
        business.update(created.id, otherId, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws NotFound updating a missing business', async () => {
      const ownerId = await makeOwner()
      await expect(
        business.update(MISSING, ownerId, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})

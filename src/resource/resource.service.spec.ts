import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { FileStorageService } from '../file-storage/file-storage.service'
import {
  FakeResourceRepository,
  fakeResourceServiceProviders,
} from '../test-utils/fake-resource'
import { mockFileStorageProvider } from '../test-utils/file-storage.mock'
import { ResourceService } from './application/resource.service'
import { ResourceType } from './domain/resource.entity'
import { StockAdjustmentReason } from './domain/stock-adjustment.entity'

/**
 * Behavioural spec for the Postgres-backed ResourceService, run against an
 * in-memory `FakeResourceRepository`. The real SQL path (ILIKE search,
 * pagination, atomic stock UPDATEs, low-stock count) is covered by the live
 * smoke test and the order specs.
 */
describe('ResourceService (behavioural, fake repository)', () => {
  let moduleRef: TestingModule
  let service: ResourceService
  let resourcesFake: FakeResourceRepository
  let fileStorage: { deleteFileInternal: jest.Mock }

  const businessA = 'biz-A'
  const businessB = 'biz-B'
  const MISSING = '30000000-0000-4000-8000-999999999999'

  beforeAll(async () => {
    const fake = fakeResourceServiceProviders()
    resourcesFake = fake.resources

    moduleRef = await Test.createTestingModule({
      providers: [...fake.providers, mockFileStorageProvider],
    }).compile()

    service = moduleRef.get(ResourceService)
    fileStorage = moduleRef.get(FileStorageService)
  })

  beforeEach(() => {
    resourcesFake._clear()
    fileStorage.deleteFileInternal.mockClear()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  describe('create', () => {
    it('creates a product with stock', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Widget',
        price: 9.99,
        availableQuantity: 25,
      })
      expect(p.type).toBe(ResourceType.PRODUCT)
      expect(p.price).toBe(9.99)
      expect(p.availableQuantity).toBe(25)
      expect(p.shortId).toHaveLength(8)
    })

    it('defaults product stock to 0', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'NoStock',
        price: 1,
      })
      expect(p.availableQuantity).toBe(0)
    })

    it('creates a service with business hours', async () => {
      const s = await service.create(businessA, {
        type: ResourceType.SERVICE,
        name: 'Haircut',
        price: 50,
        businessHours: { monday: { open: '09:00', close: '17:00' } },
      })
      expect(s.type).toBe(ResourceType.SERVICE)
      expect(s.businessHours?.monday.open).toBe('09:00')
    })

    it('rejects availableQuantity on a service', async () => {
      await expect(
        service.create(businessA, {
          type: ResourceType.SERVICE,
          name: 'Bad',
          price: 1,
          availableQuantity: 5,
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects businessHours on a product', async () => {
      await expect(
        service.create(businessA, {
          type: ResourceType.PRODUCT,
          name: 'Bad',
          price: 1,
          businessHours: { monday: { open: '09:00', close: '17:00' } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('persists image storage keys', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'WithKeys',
        price: 1,
        primaryImage: 'https://example.com/p.png',
        primaryImageKey: 'uploads/primary.png',
        supportingImages: ['https://example.com/s1.png'],
        supportingImageKeys: ['uploads/s1.png', 'uploads/s2.png'],
      })
      expect(p.primaryImageKey).toBe('uploads/primary.png')
      expect(p.supportingImageKeys).toEqual([
        'uploads/s1.png',
        'uploads/s2.png',
      ])
    })

    it('creates a product with a base unit and bulk units', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Soda',
        price: 2,
        availableQuantity: 100,
        baseUnit: 'piece',
        units: [{ name: 'carton', factor: 24, price: 45 }],
      })
      expect(p.baseUnit).toBe('piece')
      expect(p.units).toEqual([{ name: 'carton', factor: 24, price: 45 }])
    })

    it('rejects units on a service', async () => {
      await expect(
        service.create(businessA, {
          type: ResourceType.SERVICE,
          name: 'Bad',
          price: 1,
          units: [{ name: 'carton', factor: 24, price: 45 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('list / getById', () => {
    it('lists a business resources, filterable by type', async () => {
      await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'P1',
        price: 1,
      })
      await service.create(businessA, {
        type: ResourceType.SERVICE,
        name: 'S1',
        price: 2,
      })
      await service.create(businessB, {
        type: ResourceType.PRODUCT,
        name: 'Other',
        price: 3,
      })

      const all = await service.list(businessA)
      expect(all.data).toHaveLength(2)
      expect(all.meta.total).toBe(2)

      const products = await service.list(businessA, {
        type: ResourceType.PRODUCT,
      })
      expect(products.data).toHaveLength(1)

      const services = await service.list(businessA, {
        type: ResourceType.SERVICE,
      })
      expect(services.data).toHaveLength(1)
    })

    it('paginates resources (page/limit/totalPages)', async () => {
      for (let i = 0; i < 3; i++) {
        await service.create(businessA, {
          type: ResourceType.PRODUCT,
          name: `P${i}`,
          price: 1,
        })
      }

      const page1 = await service.list(businessA, { page: 1, limit: 2 })
      expect(page1.data).toHaveLength(2)
      expect(page1.meta.total).toBe(3)
      expect(page1.meta.page).toBe(1)
      expect(page1.meta.limit).toBe(2)
      expect(page1.meta.totalPages).toBe(2)

      const page2 = await service.list(businessA, { page: 2, limit: 2 })
      expect(page2.data).toHaveLength(1)
      expect(page2.meta.page).toBe(2)
    })

    it('searches resources by q (name, case-insensitive)', async () => {
      await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Espresso Beans',
        price: 1,
      })
      await service.create(businessA, {
        type: ResourceType.SERVICE,
        name: 'Haircut',
        price: 2,
      })

      const result = await service.list(businessA, { q: 'espresso' })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].name).toBe('Espresso Beans')
      expect(result.meta.total).toBe(1)
    })

    it('does not return a resource from another business (NotFound)', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Hidden',
        price: 1,
      })
      await expect(service.getById(businessB, p.id)).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })

  describe('update / delete', () => {
    it('updates product fields', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Old',
        price: 1,
      })
      const updated = await service.update(businessA, p.id, {
        name: 'New',
        price: 2.5,
        availableQuantity: 10,
      })
      expect(updated.name).toBe('New')
      expect(updated.price).toBe(2.5)
      expect(updated.availableQuantity).toBe(10)
    })

    it('rejects updating a product with businessHours', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'P',
        price: 1,
      })
      await expect(
        service.update(businessA, p.id, {
          businessHours: { monday: { open: '09:00', close: '17:00' } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('deletes a resource', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Bye',
        price: 1,
      })
      await service.delete(businessA, p.id)
      expect(resourcesFake._count()).toBe(0)
    })

    it('throws NotFound deleting a missing resource', async () => {
      await expect(service.delete(businessA, MISSING)).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })

  describe('stock operations', () => {
    async function seedProduct(qty: number, threshold = 5) {
      return await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Stocked',
        price: 1,
        availableQuantity: qty,
        lowStockThreshold: threshold,
      })
    }

    it('decrements stock when enough is available', async () => {
      const p = await seedProduct(10)
      expect(await service.decrementStock(businessA, p.id, 3)).toBe(true)
      expect(resourcesFake._get(p.id)?.availableQuantity).toBe(7)
    })

    it('refuses to decrement below zero', async () => {
      const p = await seedProduct(2)
      expect(await service.decrementStock(businessA, p.id, 5)).toBe(false)
      expect(resourcesFake._get(p.id)?.availableQuantity).toBe(2)
    })

    it('restores stock via increment', async () => {
      const p = await seedProduct(4)
      await service.incrementStock(businessA, p.id, 6)
      expect(resourcesFake._get(p.id)?.availableQuantity).toBe(10)
    })

    it('counts products at or below their low-stock threshold', async () => {
      await seedProduct(3, 5) // low
      await seedProduct(5, 5) // low (<=)
      await seedProduct(20, 5) // ok
      await service.create(businessA, {
        type: ResourceType.SERVICE,
        name: 'Svc',
        price: 1,
      }) // services excluded
      expect(await service.countLowStock(businessA)).toBe(2)
    })
  })

  describe('stock adjustments (ledger)', () => {
    const user = 'user-1'
    const makeProduct = (qty: number) =>
      service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Ledgered',
        price: 1,
        availableQuantity: qty,
      })

    it('applies a positive adjustment and records the resulting balance', async () => {
      const p = await makeProduct(30)
      const adj = await service.adjustStock(
        businessA,
        p.id,
        { delta: 20, reason: StockAdjustmentReason.RESTOCK },
        user,
      )
      expect(adj.delta).toBe(20)
      expect(adj.balanceAfter).toBe(50)
      expect(adj.reason).toBe(StockAdjustmentReason.RESTOCK)
      expect(adj.createdBy).toBe(user)
      expect(resourcesFake._get(p.id)?.availableQuantity).toBe(50)
    })

    it('rejects an adjustment that would drive stock negative (409)', async () => {
      const p = await makeProduct(5)
      await expect(
        service.adjustStock(
          businessA,
          p.id,
          { delta: -10, reason: StockAdjustmentReason.CORRECTION },
          user,
        ),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(resourcesFake._get(p.id)?.availableQuantity).toBe(5)
    })

    it('rejects a zero delta (400)', async () => {
      const p = await makeProduct(5)
      await expect(
        service.adjustStock(
          businessA,
          p.id,
          { delta: 0, reason: StockAdjustmentReason.MANUAL },
          user,
        ),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects adjustments on a service (400)', async () => {
      const s = await service.create(businessA, {
        type: ResourceType.SERVICE,
        name: 'Svc',
        price: 1,
      })
      await expect(
        service.adjustStock(
          businessA,
          s.id,
          { delta: 5, reason: StockAdjustmentReason.RESTOCK },
          user,
        ),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('logs order-flow movements and lists history newest-first', async () => {
      const p = await makeProduct(100)
      await service.decrementStock(businessA, p.id, 4) // order reservation
      await service.adjustStock(
        businessA,
        p.id,
        { delta: 10, reason: StockAdjustmentReason.RESTOCK },
        user,
      )

      const page = await service.listAdjustments(businessA, p.id, {})
      expect(page.data.map((a) => a.reason)).toEqual([
        StockAdjustmentReason.RESTOCK,
        StockAdjustmentReason.ORDER,
      ])
      expect(page.data[0].balanceAfter).toBe(106) // 100 - 4 + 10
      expect(page.data[1].delta).toBe(-4)
    })
  })

  describe('image key cleanup on update', () => {
    it('deletes the old primary image object when primaryImageKey changes', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Img',
        price: 1,
        primaryImage: 'https://example.com/old.png',
        primaryImageKey: 'uploads/old.png',
      })

      const updated = await service.update(businessA, p.id, {
        primaryImage: 'https://example.com/new.png',
        primaryImageKey: 'uploads/new.png',
      })

      expect(updated.primaryImageKey).toBe('uploads/new.png')
      expect(fileStorage.deleteFileInternal).toHaveBeenCalledTimes(1)
      expect(fileStorage.deleteFileInternal).toHaveBeenCalledWith(
        'uploads/old.png',
      )
    })

    it('deletes objects for supporting image keys removed from the array', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Img',
        price: 1,
        supportingImages: ['https://example.com/a.png'],
        supportingImageKeys: ['uploads/a.png', 'uploads/b.png'],
      })

      await service.update(businessA, p.id, {
        supportingImageKeys: ['uploads/a.png'],
      })

      expect(fileStorage.deleteFileInternal).toHaveBeenCalledTimes(1)
      expect(fileStorage.deleteFileInternal).toHaveBeenCalledWith(
        'uploads/b.png',
      )
    })

    it('does not delete anything when keys are unchanged', async () => {
      const p = await service.create(businessA, {
        type: ResourceType.PRODUCT,
        name: 'Img',
        price: 1,
        primaryImageKey: 'uploads/same.png',
        supportingImageKeys: ['uploads/x.png'],
      })

      await service.update(businessA, p.id, {
        name: 'Renamed',
        primaryImageKey: 'uploads/same.png',
        supportingImageKeys: ['uploads/x.png'],
      })

      expect(fileStorage.deleteFileInternal).not.toHaveBeenCalled()
    })
  })
})

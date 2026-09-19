import { type FilterQuery, raw } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import {
  PostgresResource,
  PostgresResourceEntity,
} from '../domain/postgres.resource-entity'
import {
  PostgresStockAdjustment,
  PostgresStockAdjustmentEntity,
} from '../domain/postgres.stock-adjustment-entity'
import { IResource, ResourceType } from '../domain/resource.entity'
import {
  ICreateResource,
  IRecordAdjustment,
  IUpdateResource,
  ListAdjustmentsOptions,
  ListResourcesOptions,
  ResourceRepository,
} from '../domain/resource.repository'
import {
  IStockAdjustment,
  StockAdjustmentReason,
} from '../domain/stock-adjustment.entity'

/** Escape LIKE/ILIKE wildcards so a raw search term matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

@Injectable()
export class PostgresResourceRepository implements ResourceRepository {
  constructor(private readonly em: EntityManager) {}

  private toDomain(entity: PostgresResource): IResource {
    return {
      id: entity.id,
      shortId: entity.shortId,
      businessId: entity.businessId,
      type: entity.type,
      name: entity.name,
      // double precision may surface as string via the driver; normalise to number.
      price: Number(entity.price),
      primaryImage: entity.primaryImage,
      primaryImageKey: entity.primaryImageKey,
      supportingImages: entity.supportingImages,
      supportingImageKeys: entity.supportingImageKeys,
      description: entity.description,
      notes: entity.notes,
      availableQuantity: entity.availableQuantity,
      lowStockThreshold: entity.lowStockThreshold,
      baseUnit: entity.baseUnit,
      units: entity.units ?? [],
      businessHours: entity.businessHours,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }

  async create(data: ICreateResource): Promise<IResource> {
    const resource = this.em.create(PostgresResourceEntity, data)
    await this.em.flush()
    return this.toDomain(resource)
  }

  async findById(businessId: string, id: string): Promise<IResource | null> {
    const resource = await this.em.findOne(PostgresResourceEntity, {
      id,
      businessId,
    })
    return resource ? this.toDomain(resource) : null
  }

  async list(
    businessId: string,
    opts: ListResourcesOptions,
  ): Promise<{ data: IResource[]; total: number }> {
    const where: FilterQuery<PostgresResource> = { businessId }
    if (opts.type) where.type = opts.type
    if (opts.q?.trim()) {
      where.name = { $ilike: `%${escapeLike(opts.q.trim())}%` }
    }

    const [rows, total] = await this.em.findAndCount(
      PostgresResourceEntity,
      where,
      { orderBy: { createdAt: 'DESC' }, limit: opts.limit, offset: opts.skip },
    )
    return { data: rows.map((r) => this.toDomain(r)), total }
  }

  async update(
    businessId: string,
    id: string,
    patch: IUpdateResource,
  ): Promise<IResource | null> {
    const resource = await this.em.findOne(PostgresResourceEntity, {
      id,
      businessId,
    })
    if (!resource) {
      return null
    }
    // Drop undefined keys (a DTO instance carries every optional field as
    // undefined); MikroORM's assign rejects undefined values.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    )
    this.em.assign(resource, clean)
    await this.em.flush()
    return this.toDomain(resource)
  }

  async delete(businessId: string, id: string): Promise<IResource | null> {
    const resource = await this.em.findOne(PostgresResourceEntity, {
      id,
      businessId,
    })
    if (!resource) {
      return null
    }
    const removed = this.toDomain(resource)
    await this.em.nativeDelete(PostgresResourceEntity, { id, businessId })
    return removed
  }

  async decrementStock(
    businessId: string,
    id: string,
    quantity: number,
  ): Promise<boolean> {
    // Order reservation: logs an `order` ledger row and returns false if there
    // wasn't enough stock (or it isn't a product).
    const adjustment = await this.recordAdjustment({
      businessId,
      resourceId: id,
      delta: -quantity,
      reason: StockAdjustmentReason.ORDER,
    })
    return adjustment !== null
  }

  async incrementStock(
    businessId: string,
    id: string,
    quantity: number,
  ): Promise<void> {
    // Order return (cancel / rollback / edit-down): logs an `order_cancel` row.
    await this.recordAdjustment({
      businessId,
      resourceId: id,
      delta: quantity,
      reason: StockAdjustmentReason.ORDER_CANCEL,
    })
  }

  async recordAdjustment(
    data: IRecordAdjustment,
  ): Promise<IStockAdjustment | null> {
    const { businessId, resourceId, delta } = data
    // Balance update + ledger insert must be one atomic unit so a row and the
    // cached `availableQuantity` can never disagree.
    return await this.em.transactional(async (em) => {
      const where: FilterQuery<PostgresResource> = {
        id: resourceId,
        businessId,
        type: ResourceType.PRODUCT,
      }
      // Guard against overselling: a negative delta needs enough on hand.
      if (delta < 0) where.availableQuantity = { $gte: -delta }

      const affected = await em.nativeUpdate(PostgresResourceEntity, where, {
        availableQuantity: raw(`available_quantity + (${delta})`),
      })
      if (affected !== 1) return null

      const resource = await em.findOne(PostgresResourceEntity, {
        id: resourceId,
        businessId,
      })
      const balanceAfter = resource?.availableQuantity ?? 0

      const adjustment = em.create(PostgresStockAdjustmentEntity, {
        businessId,
        resourceId,
        delta,
        reason: data.reason,
        balanceAfter,
        note: data.note ?? null,
        createdBy: data.createdBy ?? null,
      })
      await em.flush()
      return this.toAdjustmentDomain(adjustment)
    })
  }

  async listAdjustments(
    businessId: string,
    resourceId: string,
    opts: ListAdjustmentsOptions,
  ): Promise<{ data: IStockAdjustment[]; total: number }> {
    const [rows, total] = await this.em.findAndCount(
      PostgresStockAdjustmentEntity,
      { businessId, resourceId },
      { orderBy: { createdAt: 'DESC' }, limit: opts.limit, offset: opts.skip },
    )
    return { data: rows.map((r) => this.toAdjustmentDomain(r)), total }
  }

  private toAdjustmentDomain(
    entity: PostgresStockAdjustment,
  ): IStockAdjustment {
    return {
      id: entity.id,
      businessId: entity.businessId,
      resourceId: entity.resourceId,
      delta: entity.delta,
      reason: entity.reason,
      balanceAfter: entity.balanceAfter,
      note: entity.note,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
    }
  }

  async countLowStock(businessId: string): Promise<number> {
    // Column-to-column comparison needs a query builder / raw predicate.
    return await this.em
      .createQueryBuilder(PostgresResourceEntity)
      .where({ businessId, type: ResourceType.PRODUCT })
      .andWhere('available_quantity <= low_stock_threshold')
      .getCount()
  }
}

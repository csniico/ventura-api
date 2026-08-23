import { type FilterQuery, raw } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import {
  PostgresResource,
  PostgresResourceEntity,
} from '../domain/postgres.resource-entity'
import { IResource, ResourceType } from '../domain/resource.entity'
import {
  ICreateResource,
  IUpdateResource,
  ListResourcesOptions,
  ResourceRepository,
} from '../domain/resource.repository'

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
    // Single conditional UPDATE: only decrements a product with enough stock.
    const affected = await this.em.nativeUpdate(
      PostgresResourceEntity,
      {
        id,
        businessId,
        type: ResourceType.PRODUCT,
        availableQuantity: { $gte: quantity },
      },
      { availableQuantity: raw(`available_quantity - ${quantity}`) },
    )
    return affected === 1
  }

  async incrementStock(
    businessId: string,
    id: string,
    quantity: number,
  ): Promise<void> {
    await this.em.nativeUpdate(
      PostgresResourceEntity,
      { id, businessId, type: ResourceType.PRODUCT },
      { availableQuantity: raw(`available_quantity + ${quantity}`) },
    )
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

import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { IBusiness } from '../domain/business.entity'
import {
  BusinessRepository,
  ICreateBusiness,
  IUpdateBusiness,
} from '../domain/business.repository'
import {
  PostgresBusiness,
  PostgresBusinessEntity,
} from '../domain/postgres.business-entity'

@Injectable()
export class PostgresBusinessRepository implements BusinessRepository {
  constructor(private readonly em: EntityManager) {}

  /** Project a managed entity onto the `IBusiness` domain shape. */
  private toDomain(entity: PostgresBusiness): IBusiness {
    return {
      id: entity.id,
      shortId: entity.shortId,
      name: entity.name,
      ownerId: entity.ownerId,
      categories: entity.categories,
      description: entity.description,
      tagLine: entity.tagLine,
      logo: entity.logo,
      logoKey: entity.logoKey,
      email: entity.email,
      phone: entity.phone,
      website: entity.website,
      address: entity.address,
      city: entity.city,
      state: entity.state,
      country: entity.country,
      taxId: entity.taxId,
      registrationNumber: entity.registrationNumber,
      businessHours: entity.businessHours,
      socials: entity.socials,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }

  async findById(id: string): Promise<IBusiness | null> {
    const business = await this.em.findOne(PostgresBusinessEntity, { id })
    return business ? this.toDomain(business) : null
  }

  async findByOwner(ownerId: string): Promise<IBusiness | null> {
    const business = await this.em.findOne(PostgresBusinessEntity, { ownerId })
    return business ? this.toDomain(business) : null
  }

  async create(data: ICreateBusiness): Promise<IBusiness> {
    const business = this.em.create(PostgresBusinessEntity, data)
    await this.em.flush()
    return this.toDomain(business)
  }

  async update(id: string, patch: IUpdateBusiness): Promise<IBusiness | null> {
    const business = await this.em.findOne(PostgresBusinessEntity, { id })
    if (!business) {
      return null
    }
    // Drop keys whose value is `undefined` (a DTO instance carries every
    // optional field as undefined); MikroORM's assign rejects undefined values.
    // The remaining keys are written; an absent key is left untouched.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    )
    this.em.assign(business, clean)
    await this.em.flush()
    return this.toDomain(business)
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(PostgresBusinessEntity, { id })
  }
}

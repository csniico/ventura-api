import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { IAdmin } from '../domain/admin.entity'
import {
  AdminRepository,
  ICreateAdmin,
  IUpdateAdmin,
} from '../domain/admin.repository'
import {
  PostgresAdmin,
  PostgresAdminEntity,
} from '../domain/postgres.admin-entity'

@Injectable()
export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly em: EntityManager) {}

  private toDomain(entity: PostgresAdmin): IAdmin {
    return {
      id: entity.id,
      shortId: entity.shortId,
      name: entity.name,
      email: entity.email,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }

  async create(data: ICreateAdmin): Promise<IAdmin> {
    const admin = this.em.create(PostgresAdminEntity, data)
    await this.em.flush()
    return this.toDomain(admin)
  }

  async findById(id: string): Promise<IAdmin | null> {
    const admin = await this.em.findOne(PostgresAdminEntity, { id })
    return admin ? this.toDomain(admin) : null
  }

  async findByEmail(email: string): Promise<IAdmin | null> {
    const admin = await this.em.findOne(PostgresAdminEntity, { email })
    return admin ? this.toDomain(admin) : null
  }

  async update(id: string, patch: IUpdateAdmin): Promise<IAdmin | null> {
    const admin = await this.em.findOne(PostgresAdminEntity, { id })
    if (!admin) {
      return null
    }
    // Drop undefined keys; MikroORM's assign rejects undefined values.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    )
    this.em.assign(admin, clean)
    await this.em.flush()
    return this.toDomain(admin)
  }
}

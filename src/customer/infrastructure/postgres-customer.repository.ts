import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { FilterQuery } from '@mikro-orm/core';
import { ICustomer } from '../domain/customer.entity';
import {
  CustomerRepository,
  ICreateCustomer,
  IUpdateCustomer,
  ListCustomersOptions,
} from '../domain/customer.repository';
import {
  PostgresCustomer,
  PostgresCustomerEntity,
} from '../domain/postgres.customer-entity';

/** Escape LIKE/ILIKE wildcards so a raw search term matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

@Injectable()
export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly em: EntityManager) {}

  private toDomain(entity: PostgresCustomer): ICustomer {
    return {
      id: entity.id,
      shortId: entity.shortId,
      businessId: entity.businessId,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
      notes: entity.notes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async create(data: ICreateCustomer): Promise<ICustomer> {
    const customer = this.em.create(PostgresCustomerEntity, data);
    await this.em.flush();
    return this.toDomain(customer);
  }

  async findById(businessId: string, id: string): Promise<ICustomer | null> {
    const customer = await this.em.findOne(PostgresCustomerEntity, {
      id,
      businessId,
    });
    return customer ? this.toDomain(customer) : null;
  }

  async emailExists(businessId: string, email: string): Promise<boolean> {
    const count = await this.em.count(PostgresCustomerEntity, {
      businessId,
      email,
    });
    return count > 0;
  }

  async list(
    businessId: string,
    opts: ListCustomersOptions,
  ): Promise<{ data: ICustomer[]; total: number }> {
    const where: FilterQuery<PostgresCustomer> = { businessId };
    if (opts.q?.trim()) {
      const like = `%${escapeLike(opts.q.trim())}%`;
      where.$or = [
        { name: { $ilike: like } },
        { email: { $ilike: like } },
        { phone: { $ilike: like } },
      ];
    }

    const [rows, total] = await this.em.findAndCount(
      PostgresCustomerEntity,
      where,
      { orderBy: { createdAt: 'DESC' }, limit: opts.limit, offset: opts.skip },
    );
    return { data: rows.map((r) => this.toDomain(r)), total };
  }

  async update(
    businessId: string,
    id: string,
    patch: IUpdateCustomer,
  ): Promise<ICustomer | null> {
    const customer = await this.em.findOne(PostgresCustomerEntity, {
      id,
      businessId,
    });
    if (!customer) {
      return null;
    }
    // Drop undefined keys (a DTO instance carries every optional field as
    // undefined); MikroORM's assign rejects undefined values.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    this.em.assign(customer, clean);
    await this.em.flush();
    return this.toDomain(customer);
  }

  async delete(businessId: string, id: string): Promise<ICustomer | null> {
    const customer = await this.em.findOne(PostgresCustomerEntity, {
      id,
      businessId,
    });
    if (!customer) {
      return null;
    }
    const removed = this.toDomain(customer);
    await this.em.nativeDelete(PostgresCustomerEntity, { id, businessId });
    return removed;
  }
}

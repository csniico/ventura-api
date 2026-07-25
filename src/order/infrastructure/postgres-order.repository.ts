import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { FilterQuery } from '@mikro-orm/core';
import { IOrder, TopProduct } from '../domain/order.entity';
import {
  ICreateOrder,
  IUpdateOrder,
  ListOrdersOptions,
  OrderRepository,
} from '../domain/order.repository';
import {
  PostgresOrder,
  PostgresOrderEntity,
} from '../domain/postgres.order-entity';

/** Escape LIKE/ILIKE wildcards so a raw search term matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

@Injectable()
export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly em: EntityManager) {}

  private toDomain(entity: PostgresOrder): IOrder {
    return {
      id: entity.id,
      orderNumber: entity.orderNumber,
      businessId: entity.businessId,
      customerId: entity.customerId,
      customerName: entity.customerName,
      customerEmail: entity.customerEmail,
      customerPhone: entity.customerPhone,
      items: entity.items,
      // double precision may surface as string via the driver; normalise.
      totalAmount: Number(entity.totalAmount),
      status: entity.status,
      invoiceId: entity.invoiceId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async create(data: ICreateOrder): Promise<IOrder> {
    const order = this.em.create(PostgresOrderEntity, data);
    await this.em.flush();
    return this.toDomain(order);
  }

  async findById(businessId: string, id: string): Promise<IOrder | null> {
    const order = await this.em.findOne(PostgresOrderEntity, {
      id,
      businessId,
    });
    return order ? this.toDomain(order) : null;
  }

  async findByIds(businessId: string, ids: string[]): Promise<IOrder[]> {
    if (ids.length === 0) return [];
    const orders = await this.em.find(PostgresOrderEntity, {
      id: { $in: ids },
      businessId,
    });
    return orders.map((o) => this.toDomain(o));
  }

  async list(
    businessId: string,
    opts: ListOrdersOptions,
  ): Promise<{ data: IOrder[]; total: number }> {
    const where: FilterQuery<PostgresOrder> = { businessId };
    if (opts.status) where.status = opts.status;
    if (opts.customerId) where.customerId = opts.customerId;
    if (opts.q?.trim()) {
      const like = `%${escapeLike(opts.q.trim())}%`;
      where.$or = [
        { orderNumber: { $ilike: like } },
        { customerName: { $ilike: like } },
      ];
    }

    const [rows, total] = await this.em.findAndCount(
      PostgresOrderEntity,
      where,
      { orderBy: { createdAt: 'DESC' }, limit: opts.limit, offset: opts.skip },
    );
    return { data: rows.map((o) => this.toDomain(o)), total };
  }

  async update(
    businessId: string,
    id: string,
    patch: IUpdateOrder,
  ): Promise<IOrder | null> {
    const order = await this.em.findOne(PostgresOrderEntity, {
      id,
      businessId,
    });
    if (!order) {
      return null;
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    this.em.assign(order, clean);
    await this.em.flush();
    return this.toDomain(order);
  }

  async attachInvoice(
    businessId: string,
    ids: string[],
    invoiceId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.em.nativeUpdate(
      PostgresOrderEntity,
      { id: { $in: ids }, businessId },
      { invoiceId },
    );
  }

  async detachInvoice(businessId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.em.nativeUpdate(
      PostgresOrderEntity,
      { id: { $in: ids }, businessId },
      { invoiceId: null },
    );
  }

  async topProducts(businessId: string, limit: number): Promise<TopProduct[]> {
    // Unnest the jsonb items, keep product lines from non-cancelled orders, and
    // sum units per resource. `name` is the earliest snapshot (matches Mongo's
    // $first). Column comparisons over jsonb need a raw query.
    const rows = await this.em
      .getConnection()
      .execute<
        { resourceId: string; name: string; unitsSold: string | number }[]
      >(
        `select
         item->>'resourceId' as "resourceId",
         (array_agg(item->>'name' order by o.created_at asc))[1] as "name",
         sum((item->>'quantity')::int) as "unitsSold"
       from orders o
       cross join lateral jsonb_array_elements(o.items) as item
       where o.business_id = ?
         and o.status <> 'cancelled'
         and item->>'type' = 'product'
       group by item->>'resourceId'
       order by "unitsSold" desc
       limit ?`,
        [businessId, limit],
      );
    return rows.map((r) => ({
      resourceId: r.resourceId,
      name: r.name,
      unitsSold: Number(r.unitsSold),
    }));
  }
}

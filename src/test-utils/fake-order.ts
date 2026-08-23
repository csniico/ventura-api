import type { Provider } from '@nestjs/common'
import { nanoid } from 'nanoid/non-secure'
import { OrderService } from '../order/application/order.service'
import { IOrder, OrderStatus, TopProduct } from '../order/domain/order.entity'
import {
  ICreateOrder,
  IUpdateOrder,
  ListOrdersOptions,
  ORDER_DATA_SOURCE,
  OrderRepository,
} from '../order/domain/order.repository'
import { ResourceType } from '../resource/domain/resource.entity'

/**
 * In-memory `OrderRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics, business-scoped queries, invoice linking, and the
 * jsonb `topProducts` aggregation.
 */
export class FakeOrderRepository implements OrderRepository {
  private readonly rows = new Map<string, IOrder>()
  private seq = 0

  create(data: ICreateOrder): Promise<IOrder> {
    const now = new Date()
    const order: IOrder = {
      id: `40000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      orderNumber: `ORD-${nanoid(8).toUpperCase()}`,
      businessId: data.businessId,
      customerId: data.customerId,
      customerName: data.customerName,
      customerEmail: data.customerEmail ?? null,
      customerPhone: data.customerPhone ?? null,
      items: data.items,
      totalAmount: data.totalAmount,
      status: data.status,
      invoiceId: null,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.set(order.id, order)
    return Promise.resolve({ ...order })
  }
  findById(businessId: string, id: string): Promise<IOrder | null> {
    const o = this.rows.get(id)
    return Promise.resolve(o && o.businessId === businessId ? { ...o } : null)
  }
  findByIds(businessId: string, ids: string[]): Promise<IOrder[]> {
    return Promise.resolve(
      ids
        .map((id) => this.rows.get(id))
        .filter((o): o is IOrder => !!o && o.businessId === businessId)
        .map((o) => ({ ...o })),
    )
  }
  list(
    businessId: string,
    opts: ListOrdersOptions,
  ): Promise<{ data: IOrder[]; total: number }> {
    let rows = [...this.rows.values()].filter(
      (o) => o.businessId === businessId,
    )
    if (opts.status) rows = rows.filter((o) => o.status === opts.status)
    if (opts.customerId)
      rows = rows.filter((o) => o.customerId === opts.customerId)
    const q = opts.q?.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q),
      )
    }
    rows.reverse() // newest first
    const total = rows.length
    const data = rows
      .slice(opts.skip, opts.skip + opts.limit)
      .map((o) => ({ ...o }))
    return Promise.resolve({ data, total })
  }
  update(
    businessId: string,
    id: string,
    patch: IUpdateOrder,
  ): Promise<IOrder | null> {
    const existing = this.rows.get(id)
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null)
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    )
    const merged = { ...existing, ...clean, updatedAt: new Date() }
    this.rows.set(id, merged)
    return Promise.resolve({ ...merged })
  }
  attachInvoice(
    businessId: string,
    ids: string[],
    invoiceId: string,
  ): Promise<void> {
    for (const id of ids) {
      const o = this.rows.get(id)
      if (o && o.businessId === businessId) o.invoiceId = invoiceId
    }
    return Promise.resolve()
  }
  detachInvoice(businessId: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      const o = this.rows.get(id)
      if (o && o.businessId === businessId) o.invoiceId = null
    }
    return Promise.resolve()
  }
  topProducts(businessId: string, limit: number): Promise<TopProduct[]> {
    const byResource = new Map<string, { name: string; unitsSold: number }>()
    // Insertion order proxies createdAt asc, so the first name seen wins ($first).
    for (const o of this.rows.values()) {
      if (o.businessId !== businessId || o.status === OrderStatus.CANCELLED) {
        continue
      }
      for (const item of o.items) {
        if (item.type !== ResourceType.PRODUCT) continue
        const acc = byResource.get(item.resourceId)
        if (acc) acc.unitsSold += item.quantity
        else
          byResource.set(item.resourceId, {
            name: item.name,
            unitsSold: item.quantity,
          })
      }
    }
    const rows = [...byResource.entries()]
      .map(([resourceId, v]) => ({ resourceId, ...v }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, limit)
    return Promise.resolve(rows)
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear()
    this.seq = 0
  }
  _get(id: string): IOrder | undefined {
    return this.rows.get(id)
  }
  _count(): number {
    return this.rows.size
  }
}

/**
 * Providers for a fake-backed `OrderService` plus a handle to the fake store.
 * The consuming module must also provide `CustomerService` + `ResourceService`
 * (OrderService depends on them).
 */
export function fakeOrderServiceProviders(): {
  providers: Provider[]
  orders: FakeOrderRepository
} {
  const orders = new FakeOrderRepository()
  return {
    orders,
    providers: [OrderService, { provide: ORDER_DATA_SOURCE, useValue: orders }],
  }
}

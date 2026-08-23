import {
  IOrder,
  OrderItemSnapshot,
  OrderStatus,
  TopProduct,
} from './order.entity'

/** Fields accepted when creating an order (scoped to a business). */
export interface ICreateOrder {
  businessId: string
  customerId: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  items: OrderItemSnapshot[]
  totalAmount: number
  status: OrderStatus
}

/** Partial patch applied to an existing order. Only present keys are written. */
export interface IUpdateOrder {
  status?: OrderStatus
  items?: OrderItemSnapshot[]
  totalAmount?: number
  invoiceId?: string | null
}

/** Options for a paginated, optionally-filtered order listing. */
export interface ListOrdersOptions {
  skip: number
  limit: number
  q?: string
  status?: OrderStatus
  customerId?: string
}

/**
 * Data-access boundary for orders. Every read/write is scoped by `businessId`.
 * Business rules (customer/resource validation, stock reconciliation, totals)
 * live in the service.
 */
export interface OrderRepository {
  create(data: ICreateOrder): Promise<IOrder>
  findById(businessId: string, id: string): Promise<IOrder | null>
  /** Load specific orders within a business (used by the invoice flow). */
  findByIds(businessId: string, ids: string[]): Promise<IOrder[]>
  list(
    businessId: string,
    opts: ListOrdersOptions,
  ): Promise<{ data: IOrder[]; total: number }>
  update(
    businessId: string,
    id: string,
    patch: IUpdateOrder,
  ): Promise<IOrder | null>
  /** Attach an invoice id to a set of orders within a business. */
  attachInvoice(
    businessId: string,
    ids: string[],
    invoiceId: string,
  ): Promise<void>
  /** Clear the invoice link from a set of orders within a business. */
  detachInvoice(businessId: string, ids: string[]): Promise<void>
  /** Top products by units sold across non-cancelled orders (for the dashboard). */
  topProducts(businessId: string, limit: number): Promise<TopProduct[]>
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const ORDER_DATA_SOURCE = Symbol('ORDER_DATA_SOURCE')

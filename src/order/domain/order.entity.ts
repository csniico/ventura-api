import { ResourceType } from '../../resource/domain/resource.entity'

export enum OrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * A line item on an order — a snapshot of the resource at order time
 * (name/price/type), so later changes to the resource don't alter historical
 * orders. `resourceId` links back to the source resource.
 */
export interface OrderItemSnapshot {
  resourceId: string
  type: ResourceType
  name: string
  /** Price for one of the chosen `unit`. */
  price: number
  /** Count in the chosen `unit` (not base units). */
  quantity: number
  /** The sell unit chosen (base unit name, or a bulk unit like "carton"). */
  unit: string
  /** Base units per one `unit`; stock moves by `quantity * unitFactor`. */
  unitFactor: number
  subTotal: number
}

/**
 * Domain contract for an order. Mirrors the public `OrderResponse`. Customer
 * details are snapshotted at order time; `businessId` scopes every read/write.
 */
export interface IOrder {
  id: string
  orderNumber: string
  businessId: string
  customerId: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  items: OrderItemSnapshot[]
  totalAmount: number
  status: OrderStatus
  invoiceId?: string | null
  createdAt: Date
  updatedAt: Date
}

/** A row of the "top products by units sold" aggregation (for the dashboard). */
export interface TopProduct {
  resourceId: string
  name: string
  unitsSold: number
}

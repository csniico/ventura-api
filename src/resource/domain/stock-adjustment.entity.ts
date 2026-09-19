/** Why a product's stock level changed — the audit reason on each ledger row. */
export enum StockAdjustmentReason {
  /** Initial balance captured when the ledger was introduced. */
  OPENING_BALANCE = 'opening_balance',
  /** Stock reserved by an order. */
  ORDER = 'order',
  /** Stock returned when an order is cancelled or edited down. */
  ORDER_CANCEL = 'order_cancel',
  /** Manual restock (received shipment). */
  RESTOCK = 'restock',
  /** Manual correction of a miscount. */
  CORRECTION = 'correction',
  /** Any other manual adjustment. */
  MANUAL = 'manual',
}

/**
 * An immutable stock-movement ledger row for a product. Every change to a
 * product's `availableQuantity` records one row carrying the signed `delta` and
 * the resulting `balanceAfter`, so stock history is fully auditable. The
 * resource's `availableQuantity` is kept as a cached running balance updated in
 * the same transaction. `businessId` scopes every read/write.
 */
export interface IStockAdjustment {
  id: string
  businessId: string
  resourceId: string
  delta: number
  reason: StockAdjustmentReason
  balanceAfter: number
  note?: string | null
  createdBy?: string | null
  createdAt: Date
}

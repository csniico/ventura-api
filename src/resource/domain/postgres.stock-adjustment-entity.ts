import { defineEntity, InferEntity } from '@mikro-orm/core'
import { StockAdjustmentReason } from './stock-adjustment.entity'

/**
 * Postgres mapping for a stock-adjustment ledger row (MikroORM v7
 * `defineEntity`). Rows are append-only; the resource's cached
 * `availableQuantity` is updated in the same transaction that inserts a row.
 * Indexed on `(businessId, resourceId)` for scoped, newest-first history reads.
 */
export const PostgresStockAdjustmentEntity = defineEntity({
  name: 'PostgresStockAdjustmentEntity',
  tableName: 'stock_adjustments',
  indexes: [{ properties: ['businessId', 'resourceId'] }],
  properties: (p) => ({
    id: p.uuid().primary().defaultRaw('gen_random_uuid()'),
    businessId: p.string(),
    resourceId: p.string(),
    delta: p.integer(),
    reason: p.enum(() => StockAdjustmentReason),
    balanceAfter: p.integer(),
    note: p.string().nullable(),
    createdBy: p.string().nullable(),
    createdAt: p
      .datetime()
      .defaultRaw('now()')
      .onCreate(() => new Date()),
  }),
})

export type PostgresStockAdjustment = InferEntity<
  typeof PostgresStockAdjustmentEntity
>

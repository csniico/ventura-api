import { IStockAdjustment } from '../domain/stock-adjustment.entity'
import { StockAdjustmentResponse } from '../responses/stock-adjustment.response'

/** Project a domain `IStockAdjustment` onto the public response contract. */
export function toStockAdjustmentResponse(
  adjustment: IStockAdjustment,
): StockAdjustmentResponse {
  return {
    id: adjustment.id,
    businessId: adjustment.businessId,
    resourceId: adjustment.resourceId,
    delta: adjustment.delta,
    reason: adjustment.reason,
    balanceAfter: adjustment.balanceAfter,
    note: adjustment.note ?? null,
    createdBy: adjustment.createdBy ?? null,
    createdAt: adjustment.createdAt,
  }
}

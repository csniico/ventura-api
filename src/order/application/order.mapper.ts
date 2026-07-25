import { IOrder } from '../domain/order.entity';
import { OrderResponse } from '../responses/order.response';

/**
 * Project a domain `IOrder` onto the public `OrderResponse` contract. Maps the
 * Postgres `id` to `_id` so the payload stays shape-compatible with the legacy
 * Mongo response, and normalises nullable columns.
 */
export function toOrderResponse(order: IOrder): OrderResponse {
  return {
    _id: order.id,
    orderNumber: order.orderNumber,
    businessId: order.businessId,
    customerId: order.customerId,
    customerName: order.customerName,
    customerEmail: order.customerEmail ?? null,
    customerPhone: order.customerPhone ?? null,
    items: order.items,
    totalAmount: order.totalAmount,
    status: order.status,
    invoiceId: order.invoiceId ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

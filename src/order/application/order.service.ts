import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerService } from '../../customer/application/customer.service';
import { ResourceService } from '../../resource/application/resource.service';
import { ResourceType } from '../../resource/domain/resource.entity';
import {
  IOrder,
  OrderItemSnapshot,
  OrderStatus,
  TopProduct,
} from '../domain/order.entity';
import { ORDER_DATA_SOURCE } from '../domain/order.repository';
import type { OrderRepository } from '../domain/order.repository';
import { CreateOrderDto, CreateOrderItemDto } from '../dto/create-order.dto';
import {
  Paginated,
  normalizePaging,
  paginate,
} from '../../common/dto/paginated';

/**
 * Postgres-backed order service. Data access goes through the `OrderRepository`
 * abstraction (DIP); business rules (customer/resource validation, stock
 * reservation + reconciliation with rollback, totals, invoice linking) live
 * here. Every operation is scoped to a `businessId`. Methods return the domain
 * `IOrder`; mapping to `OrderResponse` happens at the controller boundary.
 */
@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_DATA_SOURCE)
    private readonly orderRepository: OrderRepository,
    private readonly customerService: CustomerService,
    private readonly resourceService: ResourceService,
  ) {}

  /** Validate every requested line against the business and snapshot it. */
  private async buildItems(
    businessId: string,
    lines: CreateOrderItemDto[],
  ): Promise<OrderItemSnapshot[]> {
    const items: OrderItemSnapshot[] = [];
    for (const line of lines) {
      const resource = await this.resourceService.getById(
        businessId,
        line.resourceId,
      );
      items.push({
        resourceId: resource.id,
        type: resource.type,
        name: resource.name,
        price: resource.price,
        quantity: line.quantity,
        subTotal: resource.price * line.quantity,
      });
    }
    return items;
  }

  /**
   * Create an order. Validates the customer and every resource belong to the
   * business, snapshots customer + item details, decrements product stock
   * (rejecting if any product is short), and computes the total.
   */
  async create(businessId: string, dto: CreateOrderDto): Promise<IOrder> {
    // Customer must belong to the business (throws NotFound otherwise).
    const customer = await this.customerService.getById(
      businessId,
      dto.customerId,
    );

    const items = await this.buildItems(businessId, dto.items);

    // Reserve stock for product items. Decrement atomically; on any shortfall,
    // roll back what was already decremented and reject the order.
    const decremented: { resourceId: string; quantity: number }[] = [];
    for (const item of items) {
      if (item.type !== ResourceType.PRODUCT) continue;
      const ok = await this.resourceService.decrementStock(
        businessId,
        item.resourceId,
        item.quantity,
      );
      if (!ok) {
        await this.restoreStock(businessId, decremented);
        throw new ConflictException(`Insufficient stock for "${item.name}".`);
      }
      decremented.push({
        resourceId: item.resourceId,
        quantity: item.quantity,
      });
    }

    const totalAmount = items.reduce((sum, i) => sum + i.subTotal, 0);

    try {
      return await this.orderRepository.create({
        businessId,
        customerId: dto.customerId,
        customerName: customer.name,
        customerEmail: customer.email ?? null,
        customerPhone: customer.phone ?? null,
        items,
        totalAmount,
        status: OrderStatus.PENDING,
      });
    } catch (err) {
      // If persisting the order fails, give the reserved stock back.
      await this.restoreStock(businessId, decremented);
      throw err;
    }
  }

  /**
   * List a business's orders, newest first, paginated. Optional status/customer
   * filters. Optional `q` matches (case-insensitive) orderNumber or customerName.
   */
  async list(
    businessId: string,
    opts: {
      page?: number;
      limit?: number;
      q?: string;
      status?: OrderStatus;
      customerId?: string;
    } = {},
  ): Promise<Paginated<IOrder>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit);
    const { data, total } = await this.orderRepository.list(businessId, {
      skip,
      limit,
      q: opts.q,
      status: opts.status,
      customerId: opts.customerId,
    });
    return paginate(data, total, page, limit);
  }

  /** Get an order by id, scoped to the business. */
  async getById(businessId: string, orderId: string): Promise<IOrder> {
    const order = await this.orderRepository.findById(businessId, orderId);
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  /**
   * Legal order status transitions. CANCELLED is terminal, and a COMPLETED
   * order can only be cancelled — never reopened to PENDING, which would let
   * {@link updateItems} re-price and re-reconcile stock on finished work.
   */
  private static readonly ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> =
    {
      [OrderStatus.PENDING]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.COMPLETED]: [OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED]: [],
    };

  /**
   * Update an order's status along the allowed transition path. Cancelling a
   * non-cancelled order restores the product stock it reserved. Cancelling an
   * order that is already on an invoice is rejected (cancel the invoice first,
   * which detaches its orders).
   */
  async updateStatus(
    businessId: string,
    orderId: string,
    status: OrderStatus,
  ): Promise<IOrder> {
    const order = await this.getById(businessId, orderId);

    if (order.status === status) {
      return order;
    }

    const allowed = OrderService.ORDER_TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot change order status from ${order.status} to ${status}.`,
      );
    }

    if (status === OrderStatus.CANCELLED) {
      if (order.invoiceId) {
        throw new BadRequestException(
          'Cannot cancel an order that is on an invoice; cancel the invoice first.',
        );
      }
      await this.restoreStock(
        businessId,
        order.items
          .filter((i) => i.type === ResourceType.PRODUCT)
          .map((i) => ({ resourceId: i.resourceId, quantity: i.quantity })),
      );
    }

    const updated = await this.orderRepository.update(businessId, orderId, {
      status,
    });
    return updated ?? order;
  }

  /**
   * Replace the line items of a PENDING order. Validates each resource,
   * re-snapshots name/price/type/subTotal, reconciles reserved product stock by
   * the delta between old and new quantities, recomputes the total, and saves.
   */
  async updateItems(
    businessId: string,
    orderId: string,
    lines: CreateOrderItemDto[],
  ): Promise<IOrder> {
    const order = await this.getById(businessId, orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be edited.');
    }

    const items = await this.buildItems(businessId, lines);

    // Reconcile product stock by delta vs the existing items.
    const oldQty = new Map<string, number>();
    for (const item of order.items) {
      if (item.type !== ResourceType.PRODUCT) continue;
      oldQty.set(
        item.resourceId,
        (oldQty.get(item.resourceId) ?? 0) + item.quantity,
      );
    }
    const newQty = new Map<string, number>();
    const productNames = new Map<string, string>();
    for (const item of items) {
      if (item.type !== ResourceType.PRODUCT) continue;
      newQty.set(
        item.resourceId,
        (newQty.get(item.resourceId) ?? 0) + item.quantity,
      );
      productNames.set(item.resourceId, item.name);
    }
    for (const item of order.items) {
      if (item.type !== ResourceType.PRODUCT) continue;
      if (!productNames.has(item.resourceId)) {
        productNames.set(item.resourceId, item.name);
      }
    }

    const resourceIds = new Set<string>([...oldQty.keys(), ...newQty.keys()]);

    // Track every applied delta so we can roll back symmetrically on failure.
    const applied: { resourceId: string; quantity: number }[] = [];
    const rollback = async () => {
      for (const a of applied) {
        if (a.quantity > 0) {
          await this.resourceService.incrementStock(
            businessId,
            a.resourceId,
            a.quantity,
          );
        } else {
          await this.resourceService.decrementStock(
            businessId,
            a.resourceId,
            -a.quantity,
          );
        }
      }
    };

    try {
      for (const resourceId of resourceIds) {
        const before = oldQty.get(resourceId) ?? 0;
        const after = newQty.get(resourceId) ?? 0;
        const delta = after - before;
        if (delta === 0) continue;

        if (delta > 0) {
          const ok = await this.resourceService.decrementStock(
            businessId,
            resourceId,
            delta,
          );
          if (!ok) {
            throw new ConflictException(
              `Insufficient stock for "${productNames.get(resourceId) ?? resourceId}".`,
            );
          }
          applied.push({ resourceId, quantity: delta });
        } else {
          await this.resourceService.incrementStock(
            businessId,
            resourceId,
            -delta,
          );
          applied.push({ resourceId, quantity: delta });
        }
      }
    } catch (err) {
      await rollback();
      throw err;
    }

    const totalAmount = items.reduce((sum, i) => sum + i.subTotal, 0);

    try {
      const updated = await this.orderRepository.update(businessId, orderId, {
        items,
        totalAmount,
      });
      return updated ?? order;
    } catch (err) {
      // If persisting fails, undo the stock reconciliation we just applied.
      await rollback();
      throw err;
    }
  }

  /** Load specific orders within a business (used by the invoice flow). */
  async findByIdsInBusiness(
    businessId: string,
    orderIds: string[],
  ): Promise<IOrder[]> {
    return this.orderRepository.findByIds(businessId, orderIds);
  }

  /** Attach an invoice id to a set of orders within a business. */
  async attachInvoice(
    businessId: string,
    orderIds: string[],
    invoiceId: string,
  ): Promise<void> {
    await this.orderRepository.attachInvoice(businessId, orderIds, invoiceId);
  }

  /** Clear the invoice link from a set of orders (e.g. invoice cancelled). */
  async detachInvoice(businessId: string, orderIds: string[]): Promise<void> {
    await this.orderRepository.detachInvoice(businessId, orderIds);
  }

  /** Top products by units sold across non-cancelled orders (for the dashboard). */
  async topProducts(businessId: string, limit: number): Promise<TopProduct[]> {
    return this.orderRepository.topProducts(businessId, limit);
  }

  /** Give back reserved product stock for the given line items. */
  private async restoreStock(
    businessId: string,
    items: { resourceId: string; quantity: number }[],
  ): Promise<void> {
    await Promise.all(
      items.map((i) =>
        this.resourceService.incrementStock(
          businessId,
          i.resourceId,
          i.quantity,
        ),
      ),
    );
  }
}

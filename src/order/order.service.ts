import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { ResourceService } from '../resource/resource.service';
import { ResourceType } from '../resource/schemas/resource.schema';
import {
  Order,
  OrderDocument,
  OrderItem,
  OrderStatus,
} from './schemas/order.schema';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { Paginated, normalizePaging, paginate } from '../common/dto/paginated';
import { escapeRegex } from '../common/util/escape-regex';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly customerService: CustomerService,
    private readonly resourceService: ResourceService,
  ) {}

  /**
   * Create an order. Validates the customer and every resource belong to the
   * business, snapshots customer + item details, decrements product stock
   * (rejecting if any product is short), and computes the total.
   */
  async create(
    businessId: string,
    dto: CreateOrderDto,
  ): Promise<OrderDocument> {
    // Customer must belong to the business (throws NotFound otherwise).
    const customer = await this.customerService.getById(
      businessId,
      dto.customerId,
    );

    // Load + validate every resource, building item snapshots.
    const items: OrderItem[] = [];
    for (const line of dto.items) {
      const resource = await this.resourceService.getById(
        businessId,
        line.resourceId,
      );
      items.push({
        resourceId: String(resource._id),
        type: resource.type,
        name: resource.name,
        price: resource.price,
        quantity: line.quantity,
        subTotal: resource.price * line.quantity,
      });
    }

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
      return await this.orderModel.create({
        businessId,
        customerId: dto.customerId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
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
  ): Promise<Paginated<OrderDocument>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit);
    const query: Record<string, unknown> = { businessId };
    if (opts.status) query.status = opts.status;
    if (opts.customerId) query.customerId = opts.customerId;
    if (opts.q?.trim()) {
      const rx = new RegExp(escapeRegex(opts.q.trim()), 'i');
      query.$or = [{ orderNumber: rx }, { customerName: rx }];
    }

    const [data, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    return paginate(data, total, page, limit);
  }

  /** Get an order by id, scoped to the business. */
  async getById(businessId: string, orderId: string): Promise<OrderDocument> {
    const order = await this.orderModel
      .findOne({ _id: orderId, businessId })
      .exec();
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  /**
   * Update an order's status. Cancelling a non-cancelled order restores the
   * product stock it reserved. Status changes on an already-cancelled order are
   * rejected.
   */
  async updateStatus(
    businessId: string,
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderDocument> {
    const order = await this.getById(businessId, orderId);

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('A cancelled order cannot change status.');
    }
    if (order.status === status) {
      return order;
    }

    if (status === OrderStatus.CANCELLED) {
      await this.restoreStock(
        businessId,
        order.items
          .filter((i) => i.type === ResourceType.PRODUCT)
          .map((i) => ({ resourceId: i.resourceId, quantity: i.quantity })),
      );
    }

    order.status = status;
    return order.save();
  }

  /**
   * Replace the line items of a PENDING order. Validates each resource,
   * re-snapshots name/price/type/subTotal, reconciles reserved product stock by
   * the delta between old and new quantities (decrement increases, increment
   * decreases / removals), recomputes the total, and saves.
   */
  async updateItems(
    businessId: string,
    orderId: string,
    lines: CreateOrderItemDto[],
  ): Promise<OrderDocument> {
    const order = await this.getById(businessId, orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be edited.');
    }

    // Validate + snapshot the new line items the same way create does.
    const items: OrderItem[] = [];
    for (const line of lines) {
      const resource = await this.resourceService.getById(
        businessId,
        line.resourceId,
      );
      items.push({
        resourceId: String(resource._id),
        type: resource.type,
        name: resource.name,
        price: resource.price,
        quantity: line.quantity,
        subTotal: resource.price * line.quantity,
      });
    }

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
    // A positive `quantity` means we decremented stock by that amount (and would
    // restore it on rollback); a negative means we incremented (would re-take).
    const applied: { resourceId: string; quantity: number }[] = [];
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
      // Roll back every delta already applied in this call.
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
      throw err;
    }

    order.items = items;
    order.totalAmount = items.reduce((sum, i) => sum + i.subTotal, 0);

    try {
      return await order.save();
    } catch (err) {
      // If persisting fails, undo the stock reconciliation we just applied.
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
      throw err;
    }
  }

  /** Load specific orders within a business (used by the invoice flow). */
  async findByIdsInBusiness(
    businessId: string,
    orderIds: string[],
  ): Promise<OrderDocument[]> {
    return this.orderModel.find({ _id: { $in: orderIds }, businessId }).exec();
  }

  /** Attach an invoice id to a set of orders within a business. */
  async attachInvoice(
    businessId: string,
    orderIds: string[],
    invoiceId: string,
  ): Promise<void> {
    await this.orderModel
      .updateMany({ _id: { $in: orderIds }, businessId }, { invoiceId })
      .exec();
  }

  /** Clear the invoice link from a set of orders (e.g. invoice cancelled). */
  async detachInvoice(businessId: string, orderIds: string[]): Promise<void> {
    await this.orderModel
      .updateMany({ _id: { $in: orderIds }, businessId }, { invoiceId: null })
      .exec();
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

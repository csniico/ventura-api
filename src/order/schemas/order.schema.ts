import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';
import { ResourceType } from '../../resource/schemas/resource.schema';

export enum OrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * A line item on an order. Stores a snapshot of the resource (name/price/type)
 * so later changes to the resource don't alter historical orders. `resourceId`
 * links back to the source resource.
 */
@Schema({ _id: false })
export class OrderItem {
  @Prop({ required: true })
  resourceId!: string;

  @Prop({ type: String, enum: ResourceType, required: true })
  type!: ResourceType;

  // Snapshot of the resource at order time.
  @Prop({ required: true })
  name!: string;

  @Prop({ type: Number, required: true })
  price!: number;

  @Prop({ type: Number, required: true, min: 1 })
  quantity!: number;

  @Prop({ type: Number, required: true })
  subTotal!: number;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

export type OrderDocument = HydratedDocument<Order>;

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({
    required: true,
    unique: true,
    default: () => `ORD-${nanoid(8).toUpperCase()}`,
  })
  orderNumber!: string;

  @Prop({ required: true, index: true })
  businessId!: string;

  // Customer is required; details are snapshotted at order time.
  @Prop({ required: true, index: true })
  customerId!: string;

  @Prop({ required: true })
  customerName!: string;

  @Prop({ type: String, default: null })
  customerEmail?: string;

  @Prop({ type: String, default: null })
  customerPhone?: string;

  @Prop({ type: [OrderItemSchema], required: true })
  items!: OrderItem[];

  @Prop({ type: Number, required: true, default: 0 })
  totalAmount!: number;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus;

  // Set when the order is attached to an invoice (filled in by the invoice module).
  @Prop({ type: String, default: null, index: true })
  invoiceId?: string | null;

  // createdAt / updatedAt added automatically by { timestamps: true }.
}

export const OrderSchema = SchemaFactory.createForClass(Order);

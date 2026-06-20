import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

export enum ResourceType {
  PRODUCT = 'product',
  SERVICE = 'service',
}

export type ResourceDocument = HydratedDocument<Resource>;

/**
 * A sellable resource owned by a business — either a product (has stock) or a
 * service (has business hours). Unified into one collection so orders can
 * reference any sellable by a single id.
 */
@Schema({ timestamps: true, collection: 'resources' })
export class Resource {
  @Prop({ required: true, unique: true, default: () => nanoid(8) })
  shortId!: string;

  @Prop({ required: true, index: true })
  businessId!: string;

  @Prop({ type: String, enum: ResourceType, required: true, index: true })
  type!: ResourceType;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: Number, required: true })
  price!: number;

  @Prop({ type: String, default: null })
  primaryImage?: string;

  // S3 object key for primaryImage, so the old object can be cleaned up when
  // the image is replaced.
  @Prop({ type: String, default: null })
  primaryImageKey?: string;

  @Prop({ type: [String], default: [] })
  supportingImages!: string[];

  // S3 object keys for supportingImages, used to clean up removed objects.
  @Prop({ type: [String], default: [] })
  supportingImageKeys!: string[];

  @Prop({ type: String, default: null })
  description?: string;

  @Prop({ type: String, default: null })
  notes?: string;

  // Product-only: current stock. Defaults 0; ignored for services.
  @Prop({ type: Number, default: 0 })
  availableQuantity!: number;

  // Product-only: reorder point. A product is "low stock" when
  // availableQuantity <= lowStockThreshold. Defaults 5; ignored for services.
  @Prop({ type: Number, default: 5 })
  lowStockThreshold!: number;

  // Service-only: { monday: { open, close }, ... }. Ignored for products.
  @Prop({ type: Object, default: null })
  businessHours?: Record<string, { open: string; close: string }> | null;

  // createdAt / updatedAt added automatically by { timestamps: true }.
}

export const ResourceSchema = SchemaFactory.createForClass(Resource);

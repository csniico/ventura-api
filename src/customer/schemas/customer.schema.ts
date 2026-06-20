import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true, collection: 'customers' })
export class Customer {
  @Prop({ required: true, unique: true, default: () => nanoid(8) })
  shortId!: string;

  // Owning business, stored as a plain string id (no populate). Indexed for
  // per-business listing and duplicate checks.
  @Prop({ required: true, index: true })
  businessId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, default: null })
  email?: string;

  @Prop({ type: String, default: null })
  phone?: string;

  @Prop({ type: String, default: null })
  notes?: string;

  // createdAt / updatedAt added automatically by { timestamps: true }.
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

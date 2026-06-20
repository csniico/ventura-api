import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

export type BusinessDocument = HydratedDocument<Business>;

@Schema({ timestamps: true, collection: 'businesses' })
export class Business {
  @Prop({ required: true, unique: true, default: () => nanoid(8) })
  shortId!: string;

  // The only mandatory field on creation.
  @Prop({ required: true })
  name!: string;

  // Owning user, stored as a plain string id (no populate).
  @Prop({ required: true, index: true })
  ownerId!: string;

  // Free-form categories: user-defined plus suggested values (see constants).
  @Prop({ type: [String], default: [] })
  categories!: string[];

  @Prop({ type: String, default: null })
  description?: string;

  @Prop({ type: String, default: null })
  tagLine?: string;

  @Prop({ type: String, default: null })
  logo?: string;

  // S3 object key for the logo (enables deleting/replacing the old object).
  @Prop({ type: String, default: null })
  logoKey?: string;

  @Prop({ type: String, default: null })
  email?: string;

  @Prop({ type: String, default: null })
  phone?: string;

  @Prop({ type: String, default: null })
  website?: string;

  // Address
  @Prop({ type: String, default: null })
  address?: string;

  @Prop({ type: String, default: null })
  city?: string;

  @Prop({ type: String, default: null })
  state?: string;

  @Prop({ type: String, default: null })
  country?: string;

  // Business details
  @Prop({ type: String, default: null })
  taxId?: string;

  @Prop({ type: String, default: null })
  registrationNumber?: string;

  // { monday: { open: '09:00', close: '17:00' }, ... }
  @Prop({ type: Object, default: null })
  businessHours?: Record<string, { open: string; close: string }>;

  // Social links keyed by platform ('instagram', 'tiktok', 'facebook', 'x',
  // 'linkedin'). Values are handles or URLs.
  @Prop({ type: Object, default: {} })
  socials!: Record<string, string>;

  @Prop({ default: true })
  isActive!: boolean;

  // createdAt / updatedAt added automatically by { timestamps: true }.
}

export const BusinessSchema = SchemaFactory.createForClass(Business);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  // _id is created automatically by MongoDB (ObjectId).

  @Prop({ required: true, unique: true, default: () => nanoid(8) })
  shortId!: string;

  @Prop({ required: true })
  firstName!: string;

  @Prop({ required: false, default: null })
  lastName?: string;

  @Prop({ required: true, unique: true })
  email!: string;

  // nullable + unique -> sparse so many users can have no googleId.
  @Prop({ required: false, unique: true, sparse: true, type: String })
  googleId?: string;

  // hidden from query results by default; request explicitly with .select('+password').
  @Prop({ required: false, select: false })
  password?: string;

  @Prop({ required: false, select: false, type: String, default: null })
  hashedRefreshToken?: string | null;

  @Prop({ required: false, default: null })
  avatarUrl?: string;

  // S3 object key for the avatar (enables deleting/replacing the old object).
  @Prop({ required: false, default: null })
  avatarKey?: string;

  // Foreign key to a Business, stored as a plain string id (no populate).
  @Prop({ required: false, default: null, index: true })
  businessId?: string;

  @Prop({ default: false })
  isSystem!: boolean;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false })
  isEmailVerified!: boolean;

  // Soft-delete flag for self-service account deletion.
  @Prop({ default: false })
  deleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VerificationCodeDocument = HydratedDocument<VerificationCode>;

/**
 * A short-lived email sign-in code. Documents auto-delete at `expiresAt` via a
 * TTL index, so expired codes never linger.
 */
@Schema({ timestamps: true, collection: 'verification_codes' })
export class VerificationCode {
  @Prop({ required: true, index: true })
  email!: string;

  // 6-digit numeric code (stored as a string to preserve leading zeros).
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export const VerificationCodeSchema =
  SchemaFactory.createForClass(VerificationCode);

// TTL index: Mongo removes the document once `expiresAt` is reached.
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

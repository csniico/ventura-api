import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmailChangeDocument = HydratedDocument<EmailChange>;

/**
 * A short-lived pending email-change request. The user confirms the new address
 * by entering the emailed code before `expiresAt`. Documents auto-delete at
 * `expiresAt` via a TTL index, so expired pending changes never linger.
 *
 * This mirrors the auth module's `verification_codes` flow but is kept
 * self-contained in the USER module so the two stay decoupled.
 */
@Schema({ timestamps: true, collection: 'email_changes' })
export class EmailChange {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  newEmail!: string;

  // 6-digit numeric code (stored as a string to preserve leading zeros).
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export const EmailChangeSchema = SchemaFactory.createForClass(EmailChange);

// TTL index: Mongo removes the document once `expiresAt` is reached.
EmailChangeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

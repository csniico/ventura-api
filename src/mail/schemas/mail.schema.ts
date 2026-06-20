import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

export enum MailStatus {
  SENT = 'sent',
  FAILED = 'failed',
}

/** The kind of email sent, for filtering/auditing. */
export enum MailType {
  VERIFICATION_CODE = 'verification_code',
  WELCOME = 'welcome',
  EXISTING_USER_SIGNIN = 'existing_user_signin',
  PASSWORD_CHANGE_REQUESTED = 'password_change_requested',
  PASSWORD_CHANGED = 'password_changed',
  ACCOUNT_DELETED = 'account_deleted',
  INVOICE = 'invoice',
}

export type MailDocument = HydratedDocument<Mail>;

@Schema({ timestamps: true, collection: 'mails' })
export class Mail {
  @Prop({ required: true, unique: true, default: () => nanoid(8) })
  shortId!: string;

  @Prop({ required: true })
  to!: string;

  @Prop({ required: true })
  from!: string;

  @Prop({ required: true })
  subject!: string;

  @Prop({ type: String, enum: MailType, required: true })
  type!: MailType;

  @Prop({ type: String, enum: MailStatus, required: true })
  status!: MailStatus;

  // Resend message id when the send succeeds.
  @Prop({ type: String, default: null })
  providerId?: string | null;

  // Error message when the send fails.
  @Prop({ type: String, default: null })
  error?: string | null;
}

export const MailSchema = SchemaFactory.createForClass(Mail);

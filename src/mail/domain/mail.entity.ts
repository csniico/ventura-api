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

/**
 * Domain contract for a persisted email-send attempt (audit log). `providerId`
 * is the Resend message id on success; `error` is set on failure.
 */
export interface IMail {
  id: string;
  shortId: string;
  to: string;
  from: string;
  subject: string;
  type: MailType;
  status: MailStatus;
  providerId?: string | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

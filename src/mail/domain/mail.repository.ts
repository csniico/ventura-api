import { IMail, MailStatus, MailType } from './mail.entity'

/** Fields accepted when recording a mail-send attempt. */
export interface ICreateMail {
  to: string
  from: string
  subject: string
  type: MailType
  status: MailStatus
  providerId?: string | null
  error?: string | null
}

/**
 * Data-access boundary for the mail audit log. The `MailService` owns the
 * send + record-keeping logic; this just persists the attempt.
 */
export interface MailRepository {
  create(data: ICreateMail): Promise<IMail>
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const MAIL_DATA_SOURCE = Symbol('MAIL_DATA_SOURCE')

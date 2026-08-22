import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { IMail, MailStatus, MailType } from './domain/mail.entity';
import { MAIL_DATA_SOURCE } from './domain/mail.repository';
import type { MailRepository } from './domain/mail.repository';
import {
  EmailContent,
  accountDeletedEmail,
  existingUserSigninEmail,
  invoiceEmail,
  passwordChangeRequestedEmail,
  passwordChangedEmail,
  verificationCodeEmail,
  welcomeEmail,
} from './templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(
    @Inject(MAIL_DATA_SOURCE)
    private readonly mailRepository: MailRepository,
    private readonly configService: ConfigService,
  ) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.configService.get<string>(
      'RESEND_FROM_EMAIL',
      'Ventura <nii@support.csniico.com>',
    );
  }

  /**
   * Send an email via Resend and persist a record of the attempt.
   * Failures are logged and stored (status=failed) but do not throw, so a
   * mail problem never breaks the auth flow that triggered it.
   */
  private async send(
    to: string,
    type: MailType,
    content: EmailContent,
  ): Promise<IMail> {
    let status = MailStatus.SENT;
    let providerId: string | null = null;
    let error: string | null = null;

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: content.subject,
        html: content.html,
      });
      if (result.error) {
        status = MailStatus.FAILED;
        error = result.error.message;
        this.logger.error(`Resend error sending to ${to}: ${error}`);
      } else {
        providerId = result.data?.id ?? null;
      }
    } catch (err) {
      status = MailStatus.FAILED;
      error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send ${type} to ${to}: ${error}`);
    }

    return this.mailRepository.create({
      to,
      from: this.fromEmail,
      subject: content.subject,
      type,
      status,
      providerId,
      error,
    });
  }

  /** Send a 6-digit verification code for passwordless email sign-in. */
  async sendVerificationCode(
    to: string,
    code: string,
    expirationMinutes = 10,
  ): Promise<IMail> {
    return this.send(
      to,
      MailType.VERIFICATION_CODE,
      verificationCodeEmail(code, expirationMinutes),
    );
  }

  /** Welcome a brand-new user. */
  async sendWelcome(to: string, firstName: string): Promise<IMail> {
    return this.send(to, MailType.WELCOME, welcomeEmail(firstName));
  }

  /** Notify when a sign-up is attempted for an already-registered email. */
  async sendExistingUserSignin(to: string, firstName: string): Promise<IMail> {
    return this.send(
      to,
      MailType.EXISTING_USER_SIGNIN,
      existingUserSigninEmail(firstName),
    );
  }

  /**
   * Notice that an account was soft-deleted (deactivated): permanent deletion
   * after the grace period, restorable by signing in before then.
   */
  async sendAccountDeleted(
    to: string,
    firstName: string,
    graceDays = 90,
  ): Promise<IMail> {
    return this.send(
      to,
      MailType.ACCOUNT_DELETED,
      accountDeletedEmail(firstName, graceDays),
    );
  }

  /** Notice that a password change was requested. */
  async sendPasswordChangeRequested(
    to: string,
    firstName: string,
  ): Promise<IMail> {
    return this.send(
      to,
      MailType.PASSWORD_CHANGE_REQUESTED,
      passwordChangeRequestedEmail(firstName),
    );
  }

  /** Security notice that a password was set or changed. */
  async sendPasswordChanged(to: string, firstName: string): Promise<IMail> {
    return this.send(
      to,
      MailType.PASSWORD_CHANGED,
      passwordChangedEmail(firstName),
    );
  }

  /** Send a customer their invoice, with an optional custom message. */
  async sendInvoice(
    to: string,
    args: {
      invoiceNumber: string;
      customerName?: string | null;
      totalAmount: number;
      message?: string | null;
    },
  ): Promise<IMail> {
    return this.send(to, MailType.INVOICE, invoiceEmail(args));
  }
}

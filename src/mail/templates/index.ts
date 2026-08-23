/**
 * Email templates. Each returns { subject, html } so the service stays simple.
 * Kept intentionally minimal and inline-styled for broad client support.
 */

export interface EmailContent {
  subject: string
  html: string
}

function layout(title: string, body: string): string {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">${title}</h1>
    ${body}
    <p style="font-size: 12px; color: #888; margin-top: 32px;">— The Ventura Team</p>
  </div>`
}

/** 6-digit verification code email. */
export function verificationCodeEmail(
  code: string,
  expirationMinutes = 10,
): EmailContent {
  return {
    subject: 'Your Ventura verification code',
    html: layout(
      'Verify your email',
      `<p style="font-size: 14px;">Use this code to sign in:</p>
       <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 16px 0;">${code}</p>
       <p style="font-size: 13px; color: #666;">This code expires in ${expirationMinutes} minutes. If you didn't request it, you can ignore this email.</p>`,
    ),
  }
}

/** Welcome email for a brand-new account. */
export function welcomeEmail(firstName: string): EmailContent {
  const name = firstName?.trim() ? firstName.trim() : 'there'
  return {
    subject: 'Welcome to Ventura',
    html: layout(
      `Welcome to Ventura, ${name}!`,
      `<p style="font-size: 14px;">Your account is ready. We're glad to have you on board.</p>
       <p style="font-size: 14px;">You can now set up your business and start managing customers, orders, and invoices.</p>`,
    ),
  }
}

/** Notice when someone tries to sign up/in with an already-registered email. */
export function existingUserSigninEmail(firstName: string): EmailContent {
  const name = firstName?.trim() ? firstName.trim() : 'there'
  return {
    subject: 'You already have a Ventura account',
    html: layout(
      `Hi ${name}`,
      `<p style="font-size: 14px;">We received a sign-up attempt for an email that already has a Ventura account.</p>
       <p style="font-size: 14px;">If this was you, just sign in as usual. If it wasn't, no action is needed.</p>`,
    ),
  }
}

/** Notice that a password change was requested. */
export function passwordChangeRequestedEmail(firstName: string): EmailContent {
  const name = firstName?.trim() ? firstName.trim() : 'there'
  return {
    subject: 'Password change requested',
    html: layout(
      `Hi ${name}`,
      `<p style="font-size: 14px;">We received a request to change the password on your Ventura account.</p>
       <p style="font-size: 14px;">You'll receive next steps to complete the change shortly.</p>
       <p style="font-size: 13px; color: #666;">If you didn't request this, you can safely ignore this email — your password hasn't changed.</p>`,
    ),
  }
}

/**
 * Notice that an account was soft-deleted (deactivated). Tells the user it will
 * be permanently deleted after the grace period, and they can restore it any
 * time before then by simply signing in.
 */
export function accountDeletedEmail(
  firstName: string,
  graceDays = 90,
): EmailContent {
  const name = firstName?.trim() ? firstName.trim() : 'there'
  return {
    subject: 'Your Ventura account has been deactivated',
    html: layout(
      `Hi ${name}`,
      `<p style="font-size: 14px;">Your Ventura account has been <strong>deactivated</strong>.</p>
       <p style="font-size: 14px;">It will be <strong>permanently deleted in ${graceDays} days</strong>. Until then, nothing is lost.</p>
       <p style="font-size: 14px;">Changed your mind? You can restore your account any time before the ${graceDays} days are up — just sign in again and it will be reactivated automatically.</p>
       <p style="font-size: 13px; color: #666;">If you didn't request this, sign in to restore your account right away.</p>`,
    ),
  }
}

/** Notify a customer that their invoice is ready, with an optional message. */
export function invoiceEmail(args: {
  invoiceNumber: string
  customerName?: string | null
  totalAmount: number
  message?: string | null
}): EmailContent {
  const name = args.customerName?.trim() ? args.customerName.trim() : 'there'
  const total = args.totalAmount.toFixed(2)
  const custom = args.message?.trim()
    ? `<p style="font-size: 14px;">${args.message.trim()}</p>`
    : ''
  return {
    subject: `Invoice ${args.invoiceNumber} from Ventura`,
    html: layout(
      `Hi ${name}`,
      `<p style="font-size: 14px;">Please find the details for invoice <strong>${args.invoiceNumber}</strong> below.</p>
       <p style="font-size: 14px;">Total amount due: <strong>GHS ${total}</strong></p>
       ${custom}
       <p style="font-size: 13px; color: #666;">Thank you for your business.</p>`,
    ),
  }
}

/** Security notice when a password is set or changed. */
export function passwordChangedEmail(firstName: string): EmailContent {
  const name = firstName?.trim() ? firstName.trim() : 'there'
  return {
    subject: 'Your Ventura password was changed',
    html: layout(
      `Hi ${name}`,
      `<p style="font-size: 14px;">This is a confirmation that the password on your Ventura account was just set or changed.</p>
       <p style="font-size: 13px; color: #666;">If you didn't do this, please contact support immediately.</p>`,
    ),
  }
}

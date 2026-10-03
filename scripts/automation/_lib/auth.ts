import { expectOk, request } from './client'
import type { RunContext } from './context'
import { Db } from './db'

interface AuthResult {
  accessToken: string
  refreshToken: string
  user: { _id: string; email: string; businessId?: string | null }
}

/**
 * Passwordless email + code login. Requests a code, reads it straight from the
 * `verification_codes` table (the only channel the automation has to the emailed
 * code), verifies it, and stores the tokens + user id on the context.
 */
export async function emailCodeLogin(ctx: RunContext, db: Db): Promise<void> {
  const email = ctx.email

  expectOk(
    await request(
      ctx,
      'onboarding',
      'request email code',
      '/auth/sign-in-email',
      {
        method: 'POST',
        body: { email },
        auth: false,
      },
    ),
    'request email code',
  )

  // The API writes the code synchronously before responding; retry briefly just
  // in case of replication/commit lag.
  let code: string | null = null
  for (let attempt = 0; attempt < 10 && !code; attempt++) {
    code = await db.readLatestCode(email)
    if (!code) await Bun.sleep(150)
  }
  if (!code) throw new Error(`No verification code found in DB for ${email}`)

  const auth = expectOk<AuthResult>(
    await request(ctx, 'onboarding', 'verify code', '/auth/verify-code', {
      method: 'POST',
      body: { email, code },
      auth: false,
    }),
    'verify code',
  )

  ctx.token = auth.accessToken
  ctx.refreshToken = auth.refreshToken
  ctx.userId = auth.user._id
}

/**
 * Alternative: email + password. Not used by the default run but kept for
 * parity.
 *
 * Account creation and setting a password are no longer reachable without a
 * token, so this bootstraps through the passwordless flow first, sets the
 * password as the authenticated user, then signs in with it.
 */
export async function emailPasswordLogin(
  ctx: RunContext,
  db: Db,
  password = process.env.AUTOMATION_PASSWORD,
): Promise<void> {
  if (!password) {
    throw new Error(
      'AUTOMATION_PASSWORD is not set. Export a throwaway password (>= 12 chars) to use the password login path.',
    )
  }

  const email = ctx.email

  // Creates the account if it does not exist and leaves us authenticated.
  await emailCodeLogin(ctx, db)

  expectOk(
    await request(ctx, 'onboarding', 'set password', '/users/password', {
      method: 'POST',
      body: { userId: ctx.userId, email, newPassword: password },
    }),
    'set password',
  )

  const auth = expectOk<AuthResult>(
    await request(
      ctx,
      'onboarding',
      'sign in (password)',
      '/auth/sign-in-password',
      {
        method: 'POST',
        body: { email, password },
        auth: false,
      },
    ),
    'sign in (password)',
  )
  ctx.token = auth.accessToken
  ctx.refreshToken = auth.refreshToken
}

/**
 * Ensure the onboarded user owns a business (required before any tenant-scoped
 * resource can be managed). Server resolves businessId live from the JWT sub, so
 * no token refresh is needed afterwards.
 */
export async function ensureBusiness(ctx: RunContext): Promise<void> {
  const biz = expectOk<{ _id: string }>(
    await request(ctx, 'onboarding', 'create business', '/businesses', {
      method: 'POST',
      body: {
        name: `Automation Co ${ctx.email}`,
        categories: ['Retail', 'Services'],
      },
    }),
    'create business',
  )
  ctx.businessId = biz._id
  ctx.ids.businessId = biz._id
}

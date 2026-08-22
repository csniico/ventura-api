import type { RunContext } from './context';
import { request, expectOk } from './client';
import { Db } from './db';

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { _id: string; email: string; businessId?: string | null };
}

/**
 * Passwordless email + code login. Requests a code, reads it straight from the
 * `verification_codes` table (the only channel the automation has to the emailed
 * code), verifies it, and stores the tokens + user id on the context.
 */
export async function emailCodeLogin(ctx: RunContext, db: Db): Promise<void> {
  const email = ctx.email;

  expectOk(
    await request(ctx, 'onboarding', 'request email code', '/auth/sign-in-email', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
    'request email code',
  );

  // The API writes the code synchronously before responding; retry briefly just
  // in case of replication/commit lag.
  let code: string | null = null;
  for (let attempt = 0; attempt < 10 && !code; attempt++) {
    code = await db.readLatestCode(email);
    if (!code) await Bun.sleep(150);
  }
  if (!code) throw new Error(`No verification code found in DB for ${email}`);

  const auth = expectOk<AuthResult>(
    await request(ctx, 'onboarding', 'verify code', '/auth/verify-code', {
      method: 'POST',
      body: { email, code },
      auth: false,
    }),
    'verify code',
  );

  ctx.token = auth.accessToken;
  ctx.refreshToken = auth.refreshToken;
  ctx.userId = auth.user._id;
}

/**
 * Alternative: email + password. Creates the user, sets a password, and signs
 * in. Not used by the default run but kept for completeness / parity.
 */
export async function emailPasswordLogin(
  ctx: RunContext,
  password = 'Sup3r-Secret!pw',
): Promise<void> {
  const email = ctx.email;

  const user = expectOk<{ _id: string }>(
    await request(ctx, 'onboarding', 'create user', '/users/email', {
      method: 'POST',
      body: { firstName: 'Automation', email },
      auth: false,
    }),
    'create user',
  );
  ctx.userId = user._id;

  expectOk(
    await request(ctx, 'onboarding', 'set password', '/users/password', {
      method: 'POST',
      body: { userId: user._id, email, newPassword: password },
      auth: false,
    }),
    'set password',
  );

  const auth = expectOk<AuthResult>(
    await request(ctx, 'onboarding', 'sign in (password)', '/auth/sign-in-password', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
    'sign in (password)',
  );
  ctx.token = auth.accessToken;
  ctx.refreshToken = auth.refreshToken;
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
  );
  ctx.businessId = biz._id;
  ctx.ids.businessId = biz._id;
}

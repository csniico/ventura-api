import { addProbe, type RunContext } from '../_lib/context';
import { request } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';

/**
 * Onboarding workflow: the passwordless auth handshake (already run by the
 * harness bootstrap) plus the surrounding account/business reads and a token
 * refresh — the full "new user gets set up" surface.
 */
export const workflow: Workflow = {
  name: 'onboarding',
  async run(ctx: RunContext) {
    // Business + setup context reads (business was created during bootstrap).
    await request(ctx, 'onboarding', 'get my business', '/businesses/mine');
    await request(ctx, 'onboarding', 'list categories', '/businesses/categories');
    if (ctx.businessId) {
      await request(ctx, 'onboarding', 'get business by id', `/businesses/${ctx.businessId}`);
      await request(ctx, 'onboarding', 'update business', `/businesses/${ctx.businessId}`, {
        method: 'PATCH',
        body: { description: 'Updated by automation', tagLine: 'Fast + reliable' },
      });
      addProbe(ctx, 'business detail', `/businesses/${ctx.businessId}`);
    }

    // User profile reads/writes.
    if (ctx.userId) {
      await request(ctx, 'onboarding', 'get user', `/users/${ctx.userId}`);
      await request(ctx, 'onboarding', 'has password', `/users/${ctx.userId}/has-password`);
      await request(ctx, 'onboarding', 'update first name', `/users/${ctx.userId}/first-name`, {
        method: 'PATCH',
        body: { firstName: 'Automated' },
      });
      addProbe(ctx, 'user detail', `/users/${ctx.userId}`);
    }

    // Setup progress + token refresh. The RefreshJwtGuard reads the refresh
    // token from the Authorization bearer header, so pass it as the token.
    await request(ctx, 'onboarding', 'setup status', '/setup/status');
    if (ctx.refreshToken) {
      const res = await request<{ accessToken: string; refreshToken: string }>(
        ctx,
        'onboarding',
        'refresh token',
        '/auth/refresh',
        { method: 'POST', token: ctx.refreshToken },
      );
      if (res.ok && res.body?.accessToken) {
        ctx.token = res.body.accessToken;
        ctx.refreshToken = res.body.refreshToken;
      }
    }
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

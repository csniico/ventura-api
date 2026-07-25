import { addProbe, type RunContext } from '../_lib/context';
import { request, expectOk } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';

/**
 * Admin surface: profile CRUD (create idempotent-by-email, get, patch) and the
 * manage-users operations (list, get, soft delete, restore, permanent delete)
 * against a throwaway user. Admin endpoints are unauthenticated.
 */
export const workflow: Workflow = {
  name: 'admin',
  async run(ctx: RunContext) {
    // --- Admin profile ---
    const admin = expectOk<{ _id: string }>(
      await request(ctx, 'admin', 'create profile', '/admin/profile', {
        method: 'POST',
        auth: false,
        body: { name: 'Automation Admin', email: `admin-${ctx.email}` },
      }),
      'create admin',
    );
    ctx.ids.adminId = admin._id;

    await request(ctx, 'admin', 'get profile', `/admin/profile/${admin._id}`, {
      auth: false,
    });
    await request(ctx, 'admin', 'update profile', `/admin/profile/${admin._id}`, {
      method: 'PATCH',
      auth: false,
      body: { name: 'Automation Admin (Lead)' },
    });

    // --- Manage users (on a throwaway user) ---
    const target = expectOk<{ _id: string }>(
      await request(ctx, 'admin', 'prereq: create user', '/users/email', {
        method: 'POST',
        auth: false,
        body: { firstName: 'Managed', email: `managed-${ctx.email}` },
      }),
      'create managed user',
    );
    ctx.ids.adminTargetUserId = target._id;

    await request(ctx, 'admin', 'list users', '/admin/users', { auth: false });
    await request(ctx, 'admin', 'get user', `/admin/users/${target._id}`, {
      auth: false,
    });
    await request(ctx, 'admin', 'soft delete user', `/admin/users/${target._id}`, {
      method: 'DELETE',
      auth: false,
    });
    await request(ctx, 'admin', 'restore user', `/admin/users/${target._id}/restore`, {
      method: 'POST',
      auth: false,
      body: {},
    });

    addProbe(ctx, 'admin users list', '/admin/users');
    addProbe(ctx, 'admin profile detail', `/admin/profile/${admin._id}`);
  },

  async teardown(ctx: RunContext) {
    // Permanently remove the throwaway managed user (also demonstrates the
    // permanent-delete endpoint). Admin profiles have no delete endpoint.
    if (ctx.ids.adminTargetUserId) {
      await request(
        ctx,
        'admin',
        'permanent delete user',
        `/admin/users/${ctx.ids.adminTargetUserId}/permanent`,
        { method: 'DELETE', auth: false },
      );
    }
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

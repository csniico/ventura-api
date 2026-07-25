import type { RunContext } from './context';
import { request, expectOk } from './client';
import { makeCustomer, makeProduct } from './factories';

export interface StressTarget {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  auth?: boolean;
}

function isoInHours(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

/**
 * Seed one of every resource (so `:id` reads resolve), then build the default
 * stress catalog: every readable endpoint across all resources. Returns the
 * targets plus a best-effort teardown for the seeded data.
 *
 * Default targets are GET-only so a high-volume run is non-destructive.
 */
export async function seedTargets(
  ctx: RunContext,
): Promise<{ targets: StressTarget[]; teardown: () => Promise<void> }> {
  console.log(`\n▶ Seeding one of each resource for the stress catalog`);

  const customerId = await makeCustomer(ctx, 'stress-seed', 'Acme Holdings');
  const productId = await makeProduct(ctx, 'stress-seed', 25, 1000);

  const order = expectOk<{ _id: string }>(
    await request(ctx, 'stress-seed', 'seed order', '/orders', {
      method: 'POST',
      body: { customerId, items: [{ resourceId: productId, quantity: 1 }] },
    }),
    'seed order',
  );

  const invoice = expectOk<{ _id: string }>(
    await request(ctx, 'stress-seed', 'seed invoice', '/invoices', {
      method: 'POST',
      body: { orderIds: [order._id], invoiceType: 'STANDARD' },
    }),
    'seed invoice',
  );

  const appointment = expectOk<{ _id: string }>(
    await request(ctx, 'stress-seed', 'seed appointment', '/appointments', {
      method: 'POST',
      body: {
        title: 'Stress seed',
        start: isoInHours(24),
        end: isoInHours(25),
        invitees: [{ name: 'Guest', email: `guest-${ctx.email}` }],
      },
    }),
    'seed appointment',
  );

  const admin = expectOk<{ _id: string }>(
    await request(ctx, 'stress-seed', 'seed admin profile', '/admin/profile', {
      method: 'POST',
      auth: false,
      body: { name: 'Stress Admin', email: `admin-${ctx.email}` },
    }),
    'seed admin',
  );

  const managedUser = expectOk<{ _id: string }>(
    await request(ctx, 'stress-seed', 'seed managed user', '/users/email', {
      method: 'POST',
      auth: false,
      body: { firstName: 'Managed', email: `managed-${ctx.email}` },
    }),
    'seed managed user',
  );

  const bizId = ctx.businessId!;
  const userId = ctx.userId!;

  const targets: StressTarget[] = [
    // Business + account
    { method: 'GET', path: '/businesses/mine' },
    { method: 'GET', path: '/businesses/categories' },
    { method: 'GET', path: `/businesses/${bizId}` },
    { method: 'GET', path: `/users/${userId}` },
    { method: 'GET', path: `/users/${userId}/has-password` },
    // Setup + dashboard
    { method: 'GET', path: '/setup/status' },
    { method: 'GET', path: '/dashboard/summary' },
    { method: 'GET', path: '/dashboard/summary?range=7d' },
    // Customers
    { method: 'GET', path: '/customers?page=1&limit=20' },
    { method: 'GET', path: '/customers?q=acme' },
    { method: 'GET', path: `/customers/${customerId}` },
    // Resources
    { method: 'GET', path: '/resources?page=1&limit=20' },
    { method: 'GET', path: '/resources?type=product' },
    { method: 'GET', path: '/resources?q=prereq' },
    { method: 'GET', path: `/resources/${productId}` },
    // Orders
    { method: 'GET', path: '/orders?page=1&limit=20' },
    { method: 'GET', path: '/orders?status=pending' },
    { method: 'GET', path: `/orders/${order._id}` },
    // Invoices
    { method: 'GET', path: '/invoices?page=1&limit=20' },
    { method: 'GET', path: '/invoices?status=DRAFT' },
    { method: 'GET', path: `/invoices/${invoice._id}` },
    // Appointments
    { method: 'GET', path: '/appointments' },
    { method: 'GET', path: `/appointments/${appointment._id}` },
    // Search
    { method: 'GET', path: '/search?q=acme' },
    // Admin (unauthenticated)
    { method: 'GET', path: '/admin/users', auth: false },
    { method: 'GET', path: `/admin/users/${managedUser._id}`, auth: false },
    { method: 'GET', path: `/admin/profile/${admin._id}`, auth: false },
  ];

  const teardown = async () => {
    // Best-effort: delete what the API allows (invoices/orders have no delete
    // and the order is invoiced, so those + their product/customer may persist).
    await request(ctx, 'stress-seed', 'teardown appointment', `/appointments/${appointment._id}`, {
      method: 'DELETE',
    }).catch(() => {});
    await request(ctx, 'stress-seed', 'teardown managed user', `/admin/users/${managedUser._id}/permanent`, {
      method: 'DELETE',
      auth: false,
    }).catch(() => {});
    await request(ctx, 'stress-seed', 'teardown product', `/resources/${productId}`, {
      method: 'DELETE',
    }).catch(() => {});
    await request(ctx, 'stress-seed', 'teardown customer', `/customers/${customerId}`, {
      method: 'DELETE',
    }).catch(() => {});
  };

  return { targets, teardown };
}

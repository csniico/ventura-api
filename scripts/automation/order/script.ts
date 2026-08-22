import { addProbe, type RunContext } from '../_lib/context';
import { request, expectOk } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';
import {
  makeCustomer,
  makeProduct,
  deleteCustomer,
  deleteResource,
} from '../_lib/factories';

/** Full order lifecycle: create (with prereqs), list, filter, get, edit items, status. */
export const workflow: Workflow = {
  name: 'order',
  async run(ctx: RunContext) {
    const customerId = await makeCustomer(ctx, 'order', 'Order Customer');
    const resourceId = await makeProduct(ctx, 'order', 25, 100);
    ctx.ids.orderCustomerId = customerId;
    ctx.ids.orderResourceId = resourceId;

    const order = expectOk<{ _id: string }>(
      await request(ctx, 'order', 'create', '/orders', {
        method: 'POST',
        body: { customerId, items: [{ resourceId, quantity: 2 }] },
      }),
      'create order',
    );
    ctx.ids.orderId = order._id;

    await request(ctx, 'order', 'list', '/orders?page=1&limit=20');
    await request(ctx, 'order', 'filter status=pending', '/orders?status=pending');
    await request(ctx, 'order', 'get by id', `/orders/${order._id}`);
    await request(ctx, 'order', 'update items', `/orders/${order._id}`, {
      method: 'PATCH',
      body: { items: [{ resourceId, quantity: 3 }] },
    });
    await request(ctx, 'order', 'status → completed', `/orders/${order._id}/status`, {
      method: 'PATCH',
      body: { status: 'completed' },
    });

    addProbe(ctx, 'order list', '/orders?page=1&limit=20');
    addProbe(ctx, 'order detail', `/orders/${order._id}`);
  },

  async teardown(ctx: RunContext) {
    // Cancel to release reserved stock (best-effort), then remove prereqs.
    if (ctx.ids.orderId) {
      await request(ctx, 'order', 'status → cancelled', `/orders/${ctx.ids.orderId}/status`, {
        method: 'PATCH',
        body: { status: 'cancelled' },
      });
    }
    if (ctx.ids.orderResourceId)
      await deleteResource(ctx, 'order', ctx.ids.orderResourceId);
    if (ctx.ids.orderCustomerId)
      await deleteCustomer(ctx, 'order', ctx.ids.orderCustomerId);
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

import { addProbe, type RunContext } from '../_lib/context';
import { request, expectOk } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';
import {
  makeCustomer,
  makeProduct,
  deleteCustomer,
  deleteResource,
} from '../_lib/factories';

/**
 * Full invoice lifecycle: create from an order, list, get, send, record partial
 * then full payment, update status. (Invoices have no delete endpoint — the
 * final status change stands in for teardown.)
 */
export const workflow: Workflow = {
  name: 'invoice',
  async run(ctx: RunContext) {
    const customerId = await makeCustomer(ctx, 'invoice', 'Invoice Customer');
    const resourceId = await makeProduct(ctx, 'invoice', 25, 100);
    ctx.ids.invoiceCustomerId = customerId;
    ctx.ids.invoiceResourceId = resourceId;

    const order = expectOk<{ _id: string }>(
      await request(ctx, 'invoice', 'prereq: create order', '/orders', {
        method: 'POST',
        body: { customerId, items: [{ resourceId, quantity: 2 }] },
      }),
      'prereq create order',
    );
    ctx.ids.invoiceOrderId = order._id;

    const invoice = expectOk<{ _id: string; totalAmount: number }>(
      await request(ctx, 'invoice', 'create', '/invoices', {
        method: 'POST',
        body: { orderIds: [order._id], invoiceType: 'STANDARD' },
      }),
      'create invoice',
    );
    ctx.ids.invoiceId = invoice._id;
    const total = Number(invoice.totalAmount) || 0;
    const half = Math.max(0.01, Math.round((total / 2) * 100) / 100);

    await request(ctx, 'invoice', 'list', '/invoices?page=1&limit=20');
    await request(ctx, 'invoice', 'filter status=DRAFT', '/invoices?status=DRAFT');
    await request(ctx, 'invoice', 'get by id', `/invoices/${invoice._id}`);

    await request(ctx, 'invoice', 'send', `/invoices/${invoice._id}/send`, {
      method: 'POST',
      body: { message: 'Automated invoice — thanks!' },
    });

    await request(ctx, 'invoice', 'record partial payment', `/invoices/${invoice._id}/payment`, {
      method: 'PATCH',
      body: { amount: half, paymentMethod: 'MOBILE_MONEY' },
    });
    await request(ctx, 'invoice', 'record final payment', `/invoices/${invoice._id}/payment`, {
      method: 'PATCH',
      body: { amount: Math.max(0.01, Math.round((total - half) * 100) / 100), paymentMethod: 'CASH' },
    });

    await request(ctx, 'invoice', 'update status → CANCELLED', `/invoices/${invoice._id}/status`, {
      method: 'PATCH',
      body: { status: 'CANCELLED' },
    });

    addProbe(ctx, 'invoice list', '/invoices?page=1&limit=20');
    addProbe(ctx, 'invoice detail', `/invoices/${invoice._id}`);
  },

  async teardown(ctx: RunContext) {
    // Invoices/orders here can't be deleted (order is invoiced). Just remove the
    // prereq product/customer where the API allows it (best-effort).
    if (ctx.ids.invoiceResourceId)
      await deleteResource(ctx, 'invoice', ctx.ids.invoiceResourceId);
    if (ctx.ids.invoiceCustomerId)
      await deleteCustomer(ctx, 'invoice', ctx.ids.invoiceCustomerId);
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

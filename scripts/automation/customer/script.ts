import { addProbe, type RunContext } from '../_lib/context';
import { request, expectOk } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';

/** Full customer lifecycle: create, bulk import, list, search, get, patch, delete. */
export const workflow: Workflow = {
  name: 'customer',
  async run(ctx: RunContext) {
    const created = expectOk<{ _id: string }>(
      await request(ctx, 'customer', 'create', '/customers', {
        method: 'POST',
        body: {
          name: 'Ada Lovelace',
          email: `ada-${ctx.email}`,
          phone: '+1-555-111-2222',
          notes: 'VIP',
        },
      }),
      'create customer',
    );
    ctx.ids.customerId = created._id;

    await request(ctx, 'customer', 'bulk import', '/customers/import', {
      method: 'POST',
      body: {
        customers: [
          { name: 'Grace Hopper', email: `grace-${ctx.email}` },
          { name: 'Linus Torvalds', phone: '+1-555-333-4444' },
        ],
      },
    });

    await request(ctx, 'customer', 'list (page 1)', '/customers?page=1&limit=20');
    await request(ctx, 'customer', 'search q=ada', '/customers?q=ada');
    await request(ctx, 'customer', 'get by id', `/customers/${created._id}`);
    await request(ctx, 'customer', 'update', `/customers/${created._id}`, {
      method: 'PATCH',
      body: { notes: 'Updated by automation', phone: '+1-555-999-0000' },
    });

    addProbe(ctx, 'customer list', '/customers?page=1&limit=20');
    addProbe(ctx, 'customer search', '/customers?q=ada');
    addProbe(ctx, 'customer detail', `/customers/${created._id}`);
  },

  async teardown(ctx: RunContext) {
    if (ctx.ids.customerId) {
      await request(ctx, 'customer', 'delete', `/customers/${ctx.ids.customerId}`, {
        method: 'DELETE',
      });
    }
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

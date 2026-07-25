import { addProbe, type RunContext } from '../_lib/context';
import { request, expectOk } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';

/** Full resource lifecycle for both a product and a service. */
export const workflow: Workflow = {
  name: 'resource',
  async run(ctx: RunContext) {
    const product = expectOk<{ _id: string }>(
      await request(ctx, 'resource', 'create product', '/resources', {
        method: 'POST',
        body: {
          type: 'product',
          name: 'Espresso Beans 1kg',
          price: 9.99,
          availableQuantity: 100,
          lowStockThreshold: 5,
          description: 'Single-origin medium roast.',
        },
      }),
      'create product',
    );
    ctx.ids.resourceProductId = product._id;

    const service = expectOk<{ _id: string }>(
      await request(ctx, 'resource', 'create service', '/resources', {
        method: 'POST',
        body: { type: 'service', name: 'Barista Training', price: 150 },
      }),
      'create service',
    );
    ctx.ids.resourceServiceId = service._id;

    await request(ctx, 'resource', 'list all', '/resources?page=1&limit=20');
    await request(ctx, 'resource', 'filter type=product', '/resources?type=product');
    await request(ctx, 'resource', 'search q=espresso', '/resources?q=espresso');
    await request(ctx, 'resource', 'get by id', `/resources/${product._id}`);
    await request(ctx, 'resource', 'update product', `/resources/${product._id}`, {
      method: 'PATCH',
      body: { price: 11.5, name: 'Espresso Beans 1kg (Reserve)' },
    });

    addProbe(ctx, 'resource list', '/resources?page=1&limit=20');
    addProbe(ctx, 'resource filter', '/resources?type=product');
    addProbe(ctx, 'resource detail', `/resources/${product._id}`);
  },

  async teardown(ctx: RunContext) {
    for (const key of ['resourceProductId', 'resourceServiceId']) {
      const id = ctx.ids[key];
      if (id) {
        await request(ctx, 'resource', `delete ${key}`, `/resources/${id}`, {
          method: 'DELETE',
        });
      }
    }
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

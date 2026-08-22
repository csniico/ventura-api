import { addProbe, type RunContext } from '../_lib/context';
import { request } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';
import {
  makeCustomer,
  makeProduct,
  deleteCustomer,
  deleteResource,
} from '../_lib/factories';

/** Cross-entity search: seed a matchable customer + product, then query. */
export const workflow: Workflow = {
  name: 'search',
  async run(ctx: RunContext) {
    ctx.ids.searchCustomerId = await makeCustomer(ctx, 'search', 'Acme Holdings');
    ctx.ids.searchResourceId = await makeProduct(ctx, 'search', 15, 50);

    await request(ctx, 'search', 'search q=acme', '/search?q=acme');
    await request(ctx, 'search', 'search q=prereq', '/search?q=prereq');
    await request(ctx, 'search', 'search empty', '/search?q=');

    addProbe(ctx, 'search acme', '/search?q=acme');
  },

  async teardown(ctx: RunContext) {
    if (ctx.ids.searchResourceId)
      await deleteResource(ctx, 'search', ctx.ids.searchResourceId);
    if (ctx.ids.searchCustomerId)
      await deleteCustomer(ctx, 'search', ctx.ids.searchCustomerId);
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

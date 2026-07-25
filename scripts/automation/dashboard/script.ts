import { addProbe, type RunContext } from '../_lib/context';
import { request } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';

/** Dashboard summary in both chart windows. Read-only, no teardown. */
export const workflow: Workflow = {
  name: 'dashboard',
  async run(ctx: RunContext) {
    await request(ctx, 'dashboard', 'summary (30d)', '/dashboard/summary');
    await request(ctx, 'dashboard', 'summary (7d)', '/dashboard/summary?range=7d');

    addProbe(ctx, 'dashboard 30d', '/dashboard/summary');
    addProbe(ctx, 'dashboard 7d', '/dashboard/summary?range=7d');
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

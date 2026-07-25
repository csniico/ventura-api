import { addProbe, type RunContext } from '../_lib/context';
import { request } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';

/** First-run setup progress. Read-only, no teardown. */
export const workflow: Workflow = {
  name: 'setup',
  async run(ctx: RunContext) {
    await request(ctx, 'setup', 'status', '/setup/status');
    addProbe(ctx, 'setup status', '/setup/status');
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

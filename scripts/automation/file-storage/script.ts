import type { RunContext } from '../_lib/context';
import { request } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';

/**
 * File storage: request a presigned upload URL, then delete the key. These hit
 * the object store (S3) — without cloud credentials in the environment they may
 * return 5xx; the metric is still recorded (best-effort). `/files` is
 * unauthenticated.
 */
export const workflow: Workflow = {
  name: 'file-storage',
  async run(ctx: RunContext) {
    const presign = await request<{ fileKey?: string }>(
      ctx,
      'file-storage',
      'presign upload',
      '/files/presign',
      {
        method: 'POST',
        auth: false,
        body: { contentType: 'image/png', filename: 'automation.png', folder: 'automation' },
      },
    );

    const fileKey = presign.body?.fileKey ?? 'automation/nonexistent.png';
    await request(ctx, 'file-storage', 'delete file', '/files', {
      method: 'DELETE',
      auth: false,
      body: { fileKey },
    });
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}

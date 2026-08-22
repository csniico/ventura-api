import type { RunContext } from './context';
import { request } from './client';

/**
 * Load phase: replay every collected GET probe `iterations` times to build
 * latency percentiles. `concurrency === 1` runs sequentially and captures
 * per-request mem/cpu deltas; `concurrency > 1` fires batches in parallel for
 * throughput/latency-under-load and suppresses the (now-overlapping) deltas.
 */
export async function runLoadPhase(ctx: RunContext): Promise<void> {
  const { iterations, concurrency } = ctx.config;
  if (iterations <= 1 || ctx.probes.length === 0) return;

  console.log(
    `\n▶ Load phase: ${ctx.probes.length} probe(s) × ${iterations} iteration(s), concurrency ${concurrency}`,
  );

  for (const probe of ctx.probes) {
    const tasks = Array.from({ length: iterations }, (_, i) => i);
    if (concurrency <= 1) {
      for (const _ of tasks) {
        await request(ctx, 'load', probe.label, probe.path, {
          phase: 'load',
        });
      }
    } else {
      // Run in parallel batches of `concurrency`.
      for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = tasks.slice(i, i + concurrency);
        await Promise.all(
          batch.map(() =>
            request(ctx, 'load', probe.label, probe.path, {
              phase: 'load',
              noDeltas: true,
            }),
          ),
        );
      }
    }
  }
}

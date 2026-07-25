import { loadConfig, argValue } from '../_lib/config';
import { createContext } from '../_lib/context';
import { Db } from '../_lib/db';
import { preflight, bootstrap, teardownOnboarding } from '../_lib/harness';
import { runStress, type StressResult } from '../_lib/stress';
import { seedTargets, type StressTarget } from '../_lib/targets';
import { writeStressReport } from '../_lib/report';

/**
 * High-throughput stress runner. Onboards once (email+code) to get a token, then
 * fires a large volume of requests at endpoints through a bounded worker pool
 * (constant memory regardless of request count). Aggregates status/latency/
 * throughput on the fly and writes a stress report.
 *
 * By DEFAULT it sweeps EVERY readable endpoint across all resources (seeding one
 * of each resource first so `:id` reads resolve). Pass `--target`/`--targets` to
 * narrow the scope to specific endpoints.
 *
 *   # all endpoints, 1000 requests each
 *   bun run scripts/automation/stress/script.ts --total=1000 --concurrency=200
 *   # narrow to one endpoint
 *   bun run scripts/automation/stress/script.ts --target=/dashboard/summary --total=500000
 *   # narrow to a few
 *   bun run scripts/automation/stress/script.ts --targets=/setup/status,/dashboard/summary
 *
 * The default catalog is GET-only, so even a huge run is non-destructive. Point
 * --target at a write endpoint only if you mean it.
 */
async function main() {
  const config = loadConfig();
  const ctx = createContext(config);
  const db = new Db(config);

  const total = Math.max(1, Number(argValue('total') ?? 100_000));
  // Stress wants real parallelism; default high even though the load-phase
  // default (config.concurrency) is 1.
  const concurrency = Math.max(
    1,
    Number(argValue('concurrency') ?? (config.concurrency > 1 ? config.concurrency : 100)),
  );
  const method = (argValue('method') ?? 'GET').toUpperCase() as StressTarget['method'];
  const targetsArg = argValue('targets');
  const targetArg = argValue('target');
  const explicit = targetsArg ?? targetArg;

  const results: StressResult[] = [];
  let seedTeardown: (() => Promise<void>) | null = null;

  try {
    await preflight(ctx);
    await bootstrap(ctx, db);

    // Explicit --target/--targets narrows to those paths; otherwise sweep the
    // full seeded catalog across every resource.
    let targets: StressTarget[];
    if (explicit) {
      targets = explicit
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((path) => ({ method, path }));
    } else {
      const seeded = await seedTargets(ctx);
      targets = seeded.targets;
      seedTeardown = seeded.teardown;
    }

    console.log(
      `\n▶ Stressing ${targets.length} endpoint(s) × ${total.toLocaleString()} requests each (concurrency ${concurrency})`,
    );
    for (const t of targets) {
      results.push(
        await runStress(ctx, {
          target: t.path,
          method: t.method,
          auth: t.auth,
          total,
          concurrency,
        }),
      );
    }
  } catch (err) {
    console.error(
      `\n✗ Stress aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    if (!config.keep) {
      if (seedTeardown) await seedTeardown().catch(() => {});
      await teardownOnboarding(ctx).catch(() => {});
    }
    if (results.length) {
      const { json, md } = writeStressReport(ctx, import.meta.dir, results);
      console.log(`\n📄 Stress report written:\n   ${json}\n   ${md}`);
      for (const r of results) {
        console.log(
          `   ${r.method} ${r.target}: ${r.completed.toLocaleString()} done, ${r.failed} failed, ${r.throughputPerSec.toLocaleString()} req/s, p99 ${r.latency.p99}ms`,
        );
      }
    }
    await db.close();
  }

  const anyFailed = results.some((r) => r.failed > 0);
  process.exit(anyFailed ? 1 : 0);
}

if (import.meta.main) {
  await main();
}

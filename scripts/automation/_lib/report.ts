import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RunContext } from './context';
import { aggregate, groupBy, round, type RequestMetric } from './metrics';
import type { StressResult } from './stress';

function kb(bytes: number | null): string {
  if (bytes === null) return '—';
  return `${round(bytes / 1024)}`;
}

function cpuMs(m: RequestMetric): string {
  if (m.cpuUserUs === null || m.cpuSystemUs === null) return '—';
  return `${round((m.cpuUserUs + m.cpuSystemUs) / 1000)}`;
}

/** Filesystem-safe timestamp derived from the run's wall clock. */
function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export interface ReportMeta {
  runName: string;
  authMethod: string;
}

/**
 * Write `report-<ts>.json` (full per-request metrics) and `report-<ts>.md`
 * (human-readable tables) into `folder`. Returns the two paths.
 */
export function writeReport(
  ctx: RunContext,
  folder: string,
  meta: ReportMeta,
): { json: string; md: string } {
  mkdirSync(folder, { recursive: true });
  const ts = timestamp();
  const overall = aggregate(ctx.metrics);

  // ---- JSON ----
  const jsonPath = join(folder, `report-${ts}.json`);
  Bun.write(
    jsonPath,
    JSON.stringify(
      {
        run: {
          name: meta.runName,
          authMethod: meta.authMethod,
          baseUrl: ctx.baseUrl,
          email: ctx.email,
          userId: ctx.userId ?? null,
          businessId: ctx.businessId ?? null,
          iterations: ctx.config.iterations,
          concurrency: ctx.config.concurrency,
          generatedAt: ts,
        },
        summary: overall,
        metrics: ctx.metrics,
      },
      null,
      2,
    ),
  );

  // ---- Markdown ----
  const lines: string[] = [];
  lines.push(`# Automation report — ${meta.runName}`);
  lines.push('');
  lines.push(`- **Base URL:** ${ctx.baseUrl}`);
  lines.push(`- **Auth:** ${meta.authMethod}`);
  lines.push(`- **Run email:** ${ctx.email}`);
  lines.push(`- **Business id:** ${ctx.businessId ?? '—'}`);
  lines.push(
    `- **Load:** ${ctx.config.iterations} iteration(s), concurrency ${ctx.config.concurrency}`,
  );
  lines.push(`- **Generated:** ${ts}`);
  lines.push('');
  lines.push(
    `> mem/cpu columns are deltas of the **client** Bun process around each fetch (approximate client-side cost + wait, not server usage). "—" = not captured (concurrent load).`,
  );
  lines.push('');

  // Overall summary block.
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `| requests | passed | failed | total ms | avg ms | p50 | p95 | p99 | max ms | peak RSSΔ KB | total CPU ms |`,
  );
  lines.push(`|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|`);
  lines.push(
    `| ${overall.count} | ${overall.passed} | ${overall.failed} | ${overall.totalMs} | ${overall.avgMs} | ${overall.p50Ms} | ${overall.p95Ms} | ${overall.p99Ms} | ${overall.maxMs} | ${kb(overall.peakRssDeltaBytes)} | ${round(overall.totalCpuUs / 1000)} |`,
  );
  lines.push('');

  // Per-workflow aggregates.
  lines.push('## Per-workflow');
  lines.push('');
  lines.push(`| workflow | reqs | pass | fail | avg ms | p95 ms | max ms |`);
  lines.push(`|:--|--:|--:|--:|--:|--:|--:|`);
  for (const [wf, ms] of groupBy(ctx.metrics, (m) => m.workflow)) {
    const a = aggregate(ms);
    lines.push(
      `| ${wf} | ${a.count} | ${a.passed} | ${a.failed} | ${a.avgMs} | ${a.p95Ms} | ${a.maxMs} |`,
    );
  }
  lines.push('');

  // Full functional trace.
  lines.push('## Functional requests');
  lines.push('');
  lines.push(
    `| workflow | step | method | path | status | ms | RSSΔ KB | heapΔ KB | CPU ms |`,
  );
  lines.push(`|:--|:--|:--|:--|--:|--:|--:|--:|--:|`);
  for (const m of ctx.metrics.filter((x) => x.phase === 'functional')) {
    const flag = m.ok ? '' : ' ⚠️';
    lines.push(
      `| ${m.workflow} | ${m.step}${flag} | ${m.method} | ${m.path} | ${m.status} | ${m.ms} | ${kb(m.memRssDeltaBytes)} | ${kb(m.memHeapDeltaBytes)} | ${cpuMs(m)} |`,
    );
  }
  lines.push('');

  // Load-phase percentiles per probe (only if present).
  const loadMetrics = ctx.metrics.filter((m) => m.phase === 'load');
  if (loadMetrics.length) {
    lines.push('## Load phase (per endpoint)');
    lines.push('');
    lines.push(`| endpoint | samples | avg ms | p50 | p95 | p99 | max ms |`);
    lines.push(`|:--|--:|--:|--:|--:|--:|--:|`);
    for (const [path, ms] of groupBy(loadMetrics, (m) => `${m.method} ${m.path}`)) {
      const a = aggregate(ms);
      lines.push(
        `| ${path} | ${a.count} | ${a.avgMs} | ${a.p50Ms} | ${a.p95Ms} | ${a.p99Ms} | ${a.maxMs} |`,
      );
    }
    lines.push('');
  }

  // Failures callout.
  const failures = ctx.metrics.filter((m) => !m.ok);
  if (failures.length) {
    lines.push('## Failures');
    lines.push('');
    for (const f of failures) {
      lines.push(
        `- **${f.workflow} / ${f.step}** — ${f.method} ${f.path} → ${f.status}: ${f.error ?? 'unknown'}`,
      );
    }
    lines.push('');
  }

  const mdPath = join(folder, `report-${ts}.md`);
  Bun.write(mdPath, lines.join('\n'));

  return { json: jsonPath, md: mdPath };
}

/**
 * Write a stress report (`stress-<ts>.json` + `.md`) into `folder`. Separate
 * from the functional report because stress runs aggregate on the fly and keep
 * no per-request rows.
 */
export function writeStressReport(
  ctx: RunContext,
  folder: string,
  results: StressResult[],
): { json: string; md: string } {
  mkdirSync(folder, { recursive: true });
  const ts = timestamp();

  const jsonPath = join(folder, `stress-${ts}.json`);
  Bun.write(
    jsonPath,
    JSON.stringify(
      {
        run: {
          baseUrl: ctx.baseUrl,
          email: ctx.email,
          businessId: ctx.businessId ?? null,
          generatedAt: ts,
        },
        results,
      },
      null,
      2,
    ),
  );

  const lines: string[] = [];
  lines.push(`# Stress report`);
  lines.push('');
  lines.push(`- **Base URL:** ${ctx.baseUrl}`);
  lines.push(`- **Generated:** ${ts}`);
  lines.push('');
  lines.push(
    `> Latency percentiles come from a fixed-resolution histogram (0.25ms buckets), so they're approximate; min/max/avg/throughput are exact. Latencies over 2000ms fall into an overflow bucket reported at the observed max.`,
  );
  lines.push('');
  lines.push(
    `| target | total | conc. | completed | ok | failed | wall s | req/s | avg | p50 | p95 | p99 | p99.9 | max |`,
  );
  lines.push(`|:--|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|`);
  for (const r of results) {
    lines.push(
      `| ${r.method} ${r.target} | ${r.total} | ${r.concurrency} | ${r.completed} | ${r.ok} | ${r.failed} | ${round(r.wallMs / 1000)} | ${r.throughputPerSec.toLocaleString()} | ${r.latency.avg} | ${r.latency.p50} | ${r.latency.p95} | ${r.latency.p99} | ${r.latency.p999} | ${r.latency.max} |`,
    );
  }
  lines.push('');
  for (const r of results) {
    lines.push(`## ${r.method} ${r.target}`);
    lines.push('');
    lines.push(`| status | count |`);
    lines.push(`|:--|--:|`);
    for (const [status, count] of Object.entries(r.statusCounts).sort()) {
      lines.push(`| ${status} | ${count} |`);
    }
    if (r.errorSamples.length) {
      lines.push('');
      lines.push(`Error samples: ${r.errorSamples.map((e) => `\`${e}\``).join(', ')}`);
    }
    lines.push('');
  }

  const mdPath = join(folder, `stress-${ts}.md`);
  Bun.write(mdPath, lines.join('\n'));

  return { json: jsonPath, md: mdPath };
}

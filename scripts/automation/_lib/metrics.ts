/**
 * Metric shapes + aggregation for the automation runner. Every measured request
 * produces one `RequestMetric`; reports aggregate these per workflow and per
 * endpoint.
 *
 * NOTE ON mem/cpu: these are deltas of the *client* Bun process measured around
 * each awaited fetch. They approximate the client-side cost + wait of a call,
 * NOT the server's resource usage (a black-box HTTP driver cannot see inside the
 * server). Under `--concurrency>1` the deltas overlap and are recorded as null.
 */

export interface RequestMetric {
  workflow: string;
  step: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  ms: number;
  memRssDeltaBytes: number | null;
  memHeapDeltaBytes: number | null;
  cpuUserUs: number | null;
  cpuSystemUs: number | null;
  phase: 'functional' | 'load';
  error?: string;
}

export interface Aggregate {
  count: number;
  passed: number;
  failed: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  peakRssDeltaBytes: number;
  totalCpuUs: number;
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.ceil((p / 100) * sortedAsc.length) - 1,
  );
  return sortedAsc[Math.max(0, idx)];
}

export function aggregate(metrics: RequestMetric[]): Aggregate {
  const durations = metrics.map((m) => m.ms).sort((a, b) => a - b);
  const total = durations.reduce((s, d) => s + d, 0);
  const passed = metrics.filter((m) => m.ok).length;
  const peakRss = metrics.reduce(
    (max, m) => Math.max(max, m.memRssDeltaBytes ?? 0),
    0,
  );
  const totalCpu = metrics.reduce(
    (s, m) => s + (m.cpuUserUs ?? 0) + (m.cpuSystemUs ?? 0),
    0,
  );
  return {
    count: metrics.length,
    passed,
    failed: metrics.length - passed,
    totalMs: round(total),
    avgMs: metrics.length ? round(total / metrics.length) : 0,
    minMs: durations.length ? round(durations[0]) : 0,
    maxMs: durations.length ? round(durations[durations.length - 1]) : 0,
    p50Ms: round(percentile(durations, 50)),
    p95Ms: round(percentile(durations, 95)),
    p99Ms: round(percentile(durations, 99)),
    peakRssDeltaBytes: peakRss,
    totalCpuUs: totalCpu,
  };
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

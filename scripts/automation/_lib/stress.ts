import type { RunContext } from './context';
import { runPool } from './pool';
import { round } from './metrics';

/**
 * Fixed-resolution latency histogram. Percentiles over an unbounded number of
 * samples in O(buckets) memory — we never store individual latencies, so this
 * scales to hundreds of millions of requests. Values beyond `maxMs` land in an
 * overflow bucket; `max` is tracked exactly.
 */
class LatencyHistogram {
  private readonly resolutionMs: number;
  private readonly buckets: Uint32Array;
  private readonly maxIndex: number;
  count = 0;
  sum = 0;
  min = Infinity;
  max = 0;

  constructor(maxMs = 2000, resolutionMs = 0.25) {
    this.resolutionMs = resolutionMs;
    this.maxIndex = Math.ceil(maxMs / resolutionMs);
    this.buckets = new Uint32Array(this.maxIndex + 1);
  }

  record(ms: number): void {
    this.count++;
    this.sum += ms;
    if (ms < this.min) this.min = ms;
    if (ms > this.max) this.max = ms;
    const idx = Math.min(this.maxIndex, Math.max(0, Math.round(ms / this.resolutionMs)));
    this.buckets[idx]++;
  }

  percentile(p: number): number {
    if (this.count === 0) return 0;
    const target = Math.ceil((p / 100) * this.count);
    let cumulative = 0;
    for (let i = 0; i <= this.maxIndex; i++) {
      cumulative += this.buckets[i];
      if (cumulative >= target) {
        // Overflow bucket → report the exact observed max.
        if (i === this.maxIndex) return round(this.max);
        return round(i * this.resolutionMs);
      }
    }
    return round(this.max);
  }

  get avg(): number {
    return this.count ? round(this.sum / this.count) : 0;
  }
}

export interface StressOptions {
  target: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  total: number;
  concurrency: number;
}

export interface StressResult {
  target: string;
  method: string;
  total: number;
  concurrency: number;
  completed: number;
  ok: number;
  failed: number;
  wallMs: number;
  throughputPerSec: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    p999: number;
  };
  statusCounts: Record<string, number>;
  errorSamples: string[];
}

/**
 * Hammer a single endpoint `total` times through a bounded pool of size
 * `concurrency`, aggregating results as they stream in (no per-request storage,
 * no per-request logging). Progress is printed on a throttled cadence.
 */
export async function runStress(
  ctx: RunContext,
  opts: StressOptions,
): Promise<StressResult> {
  const method = opts.method ?? 'GET';
  const auth = opts.auth ?? true;
  const url = ctx.baseUrl + opts.target;
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  const baseHeaders: Record<string, string> = {};
  if (bodyStr !== undefined) baseHeaders['Content-Type'] = 'application/json';
  if (auth && ctx.token) baseHeaders['Authorization'] = `Bearer ${ctx.token}`;

  const hist = new LatencyHistogram();
  const statusCounts: Record<string, number> = {};
  const errorSamples: string[] = [];
  let ok = 0;
  let failed = 0;

  const progressEvery = Math.max(1, Math.floor(opts.total / 20)); // ~5% steps
  let logged = 0;

  console.log(
    `\n▶ Stress: ${method} ${opts.target} — ${opts.total.toLocaleString()} requests, concurrency ${opts.concurrency}`,
  );
  const wallStart = performance.now();

  await runPool(opts.total, opts.concurrency, async () => {
    const t0 = performance.now();
    let status = 0;
    try {
      const res = await fetch(url, { method, headers: baseHeaders, body: bodyStr });
      status = res.status;
      // Drain the body so the socket is freed for reuse; discard the bytes.
      await res.arrayBuffer();
      if (res.ok) ok++;
      else {
        failed++;
        if (errorSamples.length < 5) errorSamples.push(`HTTP ${status}`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      if (errorSamples.length < 5) errorSamples.push(msg);
      status = 0; // network / dropped
    }
    hist.record(performance.now() - t0);
    const key = String(status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;

    const done = hist.count;
    if (done - logged >= progressEvery) {
      logged = done;
      const pct = round((done / opts.total) * 100);
      const elapsed = (performance.now() - wallStart) / 1000;
      const rps = Math.round(done / elapsed);
      console.log(
        `  … ${done.toLocaleString()}/${opts.total.toLocaleString()} (${pct}%) — ${rps.toLocaleString()} req/s, ${failed} failed`,
      );
    }
  });

  const wallMs = performance.now() - wallStart;

  return {
    target: opts.target,
    method,
    total: opts.total,
    concurrency: opts.concurrency,
    completed: hist.count,
    ok,
    failed,
    wallMs: round(wallMs),
    throughputPerSec: Math.round(hist.count / (wallMs / 1000)),
    latency: {
      min: hist.min === Infinity ? 0 : round(hist.min),
      max: round(hist.max),
      avg: hist.avg,
      p50: hist.percentile(50),
      p90: hist.percentile(90),
      p95: hist.percentile(95),
      p99: hist.percentile(99),
      p999: hist.percentile(99.9),
    },
    statusCounts,
    errorSamples,
  };
}

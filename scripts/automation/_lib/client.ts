import type { RunContext } from './context';
import type { RequestMetric } from './metrics';

export interface RequestOptions {
  /** HTTP method. Defaults to GET. */
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body (object) — serialized and sent with a JSON content-type. */
  body?: unknown;
  /** Attach the bearer token. Default true. */
  auth?: boolean;
  /** Override the bearer token (e.g. use the refresh token for /auth/refresh). */
  token?: string;
  /** Load-phase tagging + delta suppression under concurrency. */
  phase?: 'functional' | 'load';
  /** Skip capturing mem/cpu deltas (used for concurrent load). */
  noDeltas?: boolean;
}

export interface RequestResult<T = any> {
  status: number;
  ok: boolean;
  body: T;
  metric: RequestMetric;
}

/**
 * Perform one measured HTTP request. Records status, latency, and (in
 * sequential mode) client-process memory + CPU deltas around the awaited fetch.
 * Never throws on a non-2xx response — the metric is recorded and returned so
 * the caller decides how to react.
 */
export async function request<T = any>(
  ctx: RunContext,
  workflow: string,
  step: string,
  path: string,
  opts: RequestOptions = {},
): Promise<RequestResult<T>> {
  const method = opts.method ?? 'GET';
  const auth = opts.auth ?? true;
  const captureDeltas = !opts.noDeltas;

  const bearer = opts.token ?? ctx.token;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && bearer) headers['Authorization'] = `Bearer ${bearer}`;

  const url = ctx.baseUrl + path;

  const memBefore = captureDeltas ? process.memoryUsage() : null;
  const cpuBefore = captureDeltas ? process.cpuUsage() : null;
  const t0 = performance.now();

  let status = 0;
  let ok = false;
  let parsed: any = null;
  let error: string | undefined;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    status = res.status;
    ok = res.ok;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!ok) {
      error =
        (parsed && (parsed.message ?? parsed.error)) ||
        `HTTP ${status}`;
      if (Array.isArray(error)) error = error.join('; ');
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const ms = performance.now() - t0;
  const cpu = cpuBefore ? process.cpuUsage(cpuBefore) : null;
  const memAfter = captureDeltas ? process.memoryUsage() : null;

  const metric: RequestMetric = {
    workflow,
    step,
    method,
    path,
    status,
    ok,
    ms: Math.round(ms * 100) / 100,
    memRssDeltaBytes: memBefore && memAfter ? memAfter.rss - memBefore.rss : null,
    memHeapDeltaBytes:
      memBefore && memAfter ? memAfter.heapUsed - memBefore.heapUsed : null,
    cpuUserUs: cpu ? cpu.user : null,
    cpuSystemUs: cpu ? cpu.system : null,
    phase: opts.phase ?? 'functional',
    error,
  };
  ctx.metrics.push(metric);

  const icon = ok ? '✓' : '✗';
  const label = error ? ` — ${String(error).slice(0, 80)}` : '';
  console.log(
    `  ${icon} [${workflow}] ${method} ${path} → ${status} (${metric.ms}ms)${label}`,
  );

  return { status, ok, body: parsed as T, metric };
}

/** Assert a request succeeded; throw with context if not (halts the workflow). */
export function expectOk<T>(result: RequestResult<T>, step: string): T {
  if (!result.ok) {
    throw new Error(
      `${step} failed: HTTP ${result.status} — ${result.metric.error ?? 'unknown error'}`,
    );
  }
  return result.body;
}

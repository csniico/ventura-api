import type { Config } from './config';
import type { RequestMetric } from './metrics';

/** A safe-to-repeat GET endpoint collected during the functional pass. */
export interface Probe {
  label: string;
  path: string;
}

/** Shared state threaded through every workflow in a run. */
export interface RunContext {
  config: Config;
  baseUrl: string;
  /** JWT access token once onboarding has run. */
  token?: string;
  refreshToken?: string;
  userId?: string;
  businessId?: string;
  email: string;
  metrics: RequestMetric[];
  /** Created resource ids, keyed by a stable name, for teardown. */
  ids: Record<string, string>;
  /** GET endpoints the load phase may hammer. */
  probes: Probe[];
}

export function createContext(config: Config): RunContext {
  return {
    config,
    baseUrl: config.baseUrl,
    email: config.email,
    metrics: [],
    ids: {},
    probes: [],
  };
}

export function addProbe(ctx: RunContext, label: string, path: string): void {
  if (!ctx.probes.some((p) => p.path === path)) {
    ctx.probes.push({ label, path });
  }
}

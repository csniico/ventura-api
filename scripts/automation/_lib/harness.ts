import { loadConfig } from './config';
import { createContext, type RunContext } from './context';
import { Db } from './db';
import { request } from './client';
import { emailCodeLogin, ensureBusiness } from './auth';
import { runLoadPhase } from './load';
import { writeReport, type ReportMeta } from './report';

/** A resource workflow: a functional pass plus its own teardown. */
export interface Workflow {
  name: string;
  run(ctx: RunContext): Promise<void>;
  /** Delete whatever `run` created. Best-effort; must not throw fatally. */
  teardown?(ctx: RunContext): Promise<void>;
}

/** Fail fast with a friendly message if the API isn't reachable. */
export async function preflight(ctx: RunContext): Promise<void> {
  try {
    await fetch(ctx.baseUrl + '/', { method: 'GET' });
  } catch (err) {
    throw new Error(
      `Cannot reach API at ${ctx.baseUrl} — is the server running? (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
}

/** Onboard: passwordless login + ensure a business exists. */
export async function bootstrap(ctx: RunContext, db: Db): Promise<void> {
  console.log(`\n▶ Onboarding as ${ctx.email}`);
  await emailCodeLogin(ctx, db);
  await ensureBusiness(ctx);
}

/** Delete the onboarded user (soft delete — no hard-delete on the public API). */
export async function teardownOnboarding(ctx: RunContext): Promise<void> {
  if (!ctx.userId) return;
  await request(ctx, 'onboarding', 'delete user', `/users/${ctx.userId}`, {
    method: 'DELETE',
  });
  // NOTE: businesses have no delete endpoint; the row persists tied to the
  // now-soft-deleted user. Harmless for automation purposes.
}

async function safeTeardown(
  fn: () => Promise<void>,
  label: string,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn(
      `  ! teardown(${label}) error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Run a single workflow end-to-end (onboarding → workflow → load → teardown)
 * and write a report into `folder`. Used by each `<resource>/script.ts`.
 */
export async function standalone(
  folder: string,
  workflow: Workflow,
): Promise<void> {
  const config = loadConfig();
  const ctx = createContext(config);
  const db = new Db(config);
  let failed = false;

  try {
    await preflight(ctx);
    await bootstrap(ctx, db);

    console.log(`\n▶ Workflow: ${workflow.name}`);
    await workflow.run(ctx);

    await runLoadPhase(ctx);

    if (!config.keep) {
      console.log(`\n▶ Teardown`);
      if (workflow.teardown)
        await safeTeardown(() => workflow.teardown!(ctx), workflow.name);
      await safeTeardown(() => teardownOnboarding(ctx), 'onboarding');
    }
  } catch (err) {
    failed = true;
    console.error(
      `\n✗ Run aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    const meta: ReportMeta = {
      runName: workflow.name,
      authMethod: 'email+code',
    };
    const { json, md } = writeReport(ctx, folder, meta);
    console.log(`\n📄 Report written:\n   ${json}\n   ${md}`);
    await db.close();
  }

  const anyFailed = failed || ctx.metrics.some((m) => !m.ok);
  process.exit(anyFailed ? 1 : 0);
}

/**
 * Run many workflows in one session (shared onboarding + token), then a single
 * combined report. Teardown runs in reverse order. Used by `run-all`.
 */
export async function runAll(
  folder: string,
  workflows: Workflow[],
): Promise<void> {
  const config = loadConfig();
  const ctx = createContext(config);
  const db = new Db(config);
  let failed = false;

  try {
    await preflight(ctx);
    await bootstrap(ctx, db);

    for (const wf of workflows) {
      console.log(`\n▶ Workflow: ${wf.name}`);
      try {
        await wf.run(ctx);
      } catch (err) {
        failed = true;
        console.error(
          `  ✗ ${wf.name} aborted: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await runLoadPhase(ctx);

    if (!config.keep) {
      console.log(`\n▶ Teardown (reverse order)`);
      for (const wf of [...workflows].reverse()) {
        if (wf.teardown) await safeTeardown(() => wf.teardown!(ctx), wf.name);
      }
      await safeTeardown(() => teardownOnboarding(ctx), 'onboarding');
    }
  } catch (err) {
    failed = true;
    console.error(
      `\n✗ Run aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    const { json, md } = writeReport(ctx, folder, {
      runName: 'run-all',
      authMethod: 'email+code',
    });
    console.log(`\n📄 Combined report written:\n   ${json}\n   ${md}`);
    await db.close();
  }

  const anyFailed = failed || ctx.metrics.some((m) => !m.ok);
  process.exit(anyFailed ? 1 : 0);
}

/**
 * Runtime configuration for the automation runner. Everything is read from the
 * environment with sane dev defaults so `bun run <script>` works out of the box
 * against a locally-running API. Bun auto-loads `.env`.
 */

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

export function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function argFlag(flag: string): boolean {
  return process.argv.includes(`--${flag}`);
}

export interface Config {
  baseUrl: string;
  pg: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    url: string;
  };
  /** Unique per-run email so repeated runs never collide. */
  email: string;
  /** Load phase: repeat each read probe this many times (>=1). */
  iterations: number;
  /** Load phase parallelism. 1 = sequential (captures mem/cpu per request). */
  concurrency: number;
  /** Skip teardown (leave created data in the DB). */
  keep: boolean;
}

/** Unique-per-run suffix: wall clock + randomness so repeated runs never collide. */
function runSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function loadConfig(): Config {
  const host = process.env.PG_HOST ?? 'localhost';
  const port = Number(process.env.PG_PORT ?? 5432);
  const database = process.env.PG_DBNAME ?? 'ventura_dev';
  const user = process.env.PG_USER ?? 'postgres';
  const password = process.env.PG_PASSWORD ?? 'adminUser!234';
  const url = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${database}`;

  const emailOverride = argValue('email') ?? process.env.AUTOMATION_EMAIL;
  const email = emailOverride ?? `automation+${runSuffix()}@example.com`;

  return {
    baseUrl: (argValue('base-url') ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    ),
    pg: { host, port, database, user, password, url },
    email,
    iterations: Math.max(1, Number(argValue('iterations') ?? process.env.AUTOMATION_ITERATIONS ?? 1)),
    concurrency: Math.max(1, Number(argValue('concurrency') ?? process.env.AUTOMATION_CONCURRENCY ?? 1)),
    keep: argFlag('keep') || envFlag('AUTOMATION_KEEP'),
  };
}

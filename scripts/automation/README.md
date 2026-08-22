# API automation runner

Black-box workflow driver for the Ventura API. It authenticates like a real
client and exercises **every endpoint on every resource** over plain `fetch()` —
no Nest, no Jest, no DI, no imports from `src/`. After each run it writes a
timestamped JSON + Markdown report into the workflow's own folder.

## Requirements

- [Bun](https://bun.sh) (`bun --version` ≥ 1.1)
- The API running and reachable at `BASE_URL` (default `http://localhost:3000`)
- Postgres reachable with the app's `PG_*` settings — the runner reads the
  passwordless sign-in code straight from the `verification_codes` table (the
  only channel it has to the emailed code). Uses Bun's built-in SQL client; no
  npm dependency is added.

## Run it

```bash
# everything, one session, one combined report
bun run scripts/automation/run-all/script.ts

# a single resource (self-onboards first)
bun run scripts/automation/customer/script.ts
bun run scripts/automation/order/script.ts
```

### Flags / env

| Flag | Env | Default | Meaning |
|------|-----|---------|---------|
| `--base-url=` | `BASE_URL` | `http://localhost:3000` | API base URL |
| `--email=` | `AUTOMATION_EMAIL` | unique per run | login email (must be new for email+code) |
| `--iterations=N` | `AUTOMATION_ITERATIONS` | `1` | load phase: replay each GET probe N times |
| `--concurrency=N` | `AUTOMATION_CONCURRENCY` | `1` | load phase parallelism |
| `--keep` | `AUTOMATION_KEEP` | off | skip teardown (leave created data) |
| — | `PG_HOST/PG_PORT/PG_DBNAME/PG_USER/PG_PASSWORD` | app defaults | verification-code DB read |

```bash
# load test: 50 samples per GET, 10 in flight at a time
bun run scripts/automation/run-all/script.ts --iterations=50 --concurrency=10
```

## What it records

Per request: **status code, latency (ms), memory delta, CPU delta**, workflow +
step labels. The load phase adds latency percentiles (p50/p95/p99) per endpoint.

> **mem/cpu caveat:** these are deltas of the **client** Bun process measured
> around each awaited `fetch` — they approximate client-side cost + wait, not the
> server's resource usage (a black-box HTTP driver can't see inside the server).
> Under `--concurrency>1` the deltas overlap and are recorded as `—`.

## Stress mode (high-volume load)

For throughput/latency testing at scale, `stress/` fires a large volume of
requests at one or more endpoints through a **bounded worker pool** — at most
`concurrency` requests are ever in flight, so memory stays O(concurrency)
regardless of total count (unlike the naive "push every promise into an array"
pattern, which grows without bound and OOMs). Results are aggregated on the fly
via a fixed-resolution latency histogram — no per-request rows are stored and
there's no per-request logging, so it scales to hundreds of millions.

By **default it sweeps every readable endpoint across all resources** — it seeds
one of each resource first (so `:id` reads resolve), stresses each GET
`--total` times, then tears the seed down. `--target`/`--targets` narrows the
scope to specific endpoints.

```bash
# ALL endpoints, 1000 requests each, 200 in flight
bun run scripts/automation/stress/script.ts --total=1000 --concurrency=200

# narrow: one endpoint, 1M requests
bun run scripts/automation/stress/script.ts --target=/dashboard/summary --total=1000000

# narrow: a few endpoints
bun run scripts/automation/stress/script.ts --targets=/setup/status,/dashboard/summary --total=500000
```

| Flag | Default | Meaning |
|------|---------|---------|
| `--total=N` | `100000` | requests **per target** |
| `--concurrency=N` | `100` | max requests in flight (pool size) |
| `--target=` | — | narrow to a single endpoint |
| `--targets=a,b,c` | — | narrow to several endpoints |
| `--method=` | `GET` | method for explicit targets (+ optional `--keep`) |

With no `--target`/`--targets`, the full catalog (~27 GET endpoints) is stressed;
total requests = catalog size × `--total`.

Writes `stress-<timestamp>.json` / `.md` with throughput (req/s), status-code
breakdown, and latency percentiles (p50/p95/p99/p99.9, histogram-approximate;
min/max/avg/throughput are exact). Defaults hit read-only endpoints so a huge run
is non-destructive — point `--target` at a write endpoint only deliberately.

The reusable pool lives in `_lib/pool.ts` (`runPool(total, concurrency, task)`)
and the streaming aggregator + runner in `_lib/stress.ts`.

## Auth

Default = **email + code**: `POST /auth/sign-in-email` → read the code from
`verification_codes` → `POST /auth/verify-code`. `email + password` is also
implemented in `_lib/auth.ts`. Google/Apple flows are intentionally not covered.
Business context is resolved server-side from the JWT on every request, so no
token refresh is needed after creating the business.

## Layout

```
_lib/           shared harness: config, db, auth, fetch client, metrics, load, report
<resource>/     one script.ts per workflow (runnable standalone)
run-all/        chains every workflow + writes a combined report
```

Reports (`report-<timestamp>.json` / `.md`) are written next to the script that
produced them and are git-ignored by convention (add a rule if desired).

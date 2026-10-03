/**
 * Post-deploy authentication smoke test.
 *
 * Probes a running API for the holes the security assessment found live on
 * staging. The point is that it runs against the DEPLOYED artefact: the guards
 * for `/admin/*` and `/users/*` were already present in the source while the
 * build actually serving traffic was an older one without them, and nothing in
 * the pipeline noticed (SEC-011 / SEC-012). Source-level tests cannot catch
 * that; this can.
 *
 * Wire it into the deploy pipeline after the new revision is live and fail the
 * deploy on a non-zero exit.
 *
 *   BASE_URL=https://api.staging.venturabiz.online tsx scripts/smoke-auth.ts
 */

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
)

/** A uuid that will never exist, so a 200/404 split still proves the guard. */
const ABSENT_ID = '00000000-0000-4000-8000-000000000000'

interface Probe {
  name: string
  method: string
  path: string
  body?: unknown
  /** Any of these is a pass; anything else fails the deploy. */
  expect: number[]
}

const PROBES: Probe[] = [
  // SEC-011 — admin surface must not answer without a token.
  {
    name: 'admin list users',
    method: 'GET',
    path: '/admin/users',
    expect: [401],
  },
  {
    name: 'admin delete user',
    method: 'DELETE',
    path: `/admin/users/${ABSENT_ID}`,
    expect: [401],
  },
  {
    name: 'admin restore user',
    method: 'POST',
    path: `/admin/users/${ABSENT_ID}/restore`,
    expect: [401],
  },

  // SEC-012 — no unauthenticated reads or writes on an account.
  {
    name: 'read user',
    method: 'GET',
    path: `/users/${ABSENT_ID}`,
    expect: [401],
  },
  {
    name: 'set password on another account',
    method: 'POST',
    path: '/users/password',
    body: {
      userId: ABSENT_ID,
      email: 'probe@example.com',
      newPassword: 'Sm0ke-Test!pw',
    },
    expect: [401],
  },
  {
    name: 'rename user',
    method: 'PATCH',
    path: `/users/${ABSENT_ID}/first-name`,
    body: { firstName: 'probe' },
    expect: [401],
  },

  // SEC-001 — file storage.
  {
    name: 'presign upload',
    method: 'POST',
    path: '/files/presign',
    body: { contentType: 'image/png', filename: 'probe.png' },
    expect: [401],
  },
  {
    name: 'delete file',
    method: 'DELETE',
    path: '/files',
    body: { fileKey: 'logos/probe.png' },
    expect: [401],
  },

  // SEC-002 / SEC-004 — account creation and linking are not public routes.
  {
    name: 'link google account',
    method: 'POST',
    path: '/users/link-google',
    body: { email: 'probe@example.com', googleId: 'probe-9999' },
    expect: [401, 404],
  },
  {
    name: 'create user by email',
    method: 'POST',
    path: '/users/email',
    body: { firstName: 'probe', email: 'probe@example.com' },
    expect: [401, 404],
  },

  // SEC-003 — business records are not readable without a token.
  {
    name: 'read business',
    method: 'GET',
    path: `/businesses/${ABSENT_ID}`,
    expect: [401],
  },

  // SEC-013 — the API surface is not published.
  { name: 'swagger ui', method: 'GET', path: '/api/docs', expect: [404] },
  {
    name: 'swagger json',
    method: 'GET',
    path: '/api/docs-json',
    expect: [404],
  },
]

async function run(): Promise<void> {
  console.log(`Auth smoke test against ${baseUrl}\n`)

  const failures: string[] = []

  for (const probe of PROBES) {
    const label = `${probe.method} ${probe.path}`
    let status: number | string

    try {
      const res = await fetch(`${baseUrl}${probe.path}`, {
        method: probe.method,
        headers: probe.body ? { 'Content-Type': 'application/json' } : {},
        body: probe.body ? JSON.stringify(probe.body) : undefined,
        redirect: 'manual',
      })
      status = res.status
    } catch (error) {
      status = error instanceof Error ? error.message : String(error)
    }

    const ok = typeof status === 'number' && probe.expect.includes(status)
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${probe.name.padEnd(32)} ${label} -> ${status} (want ${probe.expect.join('/')})`,
    )
    if (!ok) failures.push(`${probe.name}: ${label} returned ${status}`)
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} probe(s) failed — this build is NOT safe to serve:`,
    )
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }

  console.log('\nAll probes passed.')
}

void run()

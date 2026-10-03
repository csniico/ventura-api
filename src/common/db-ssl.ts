import { readFileSync } from 'fs'

export interface PostgresSslOptions {
  rejectUnauthorized: boolean
  ca?: string
}

/**
 * TLS settings for every Postgres connection — the app, the MikroORM CLI, and
 * the one-off scripts. Kept in one place so they cannot drift apart.
 *
 * Verification is ON by default. It was previously disabled everywhere
 * (`rejectUnauthorized: false`), which encrypts the connection but
 * authenticates nothing: anything that can intercept the link can present its
 * own certificate and read or rewrite the traffic (SEC-008).
 *
 * Configuration:
 *  - `PG_SSL_CA`       — the provider's CA certificate, either a PEM literal
 *                        or a path to a .pem/.crt file. Needed when the
 *                        provider issues certificates from a private CA.
 *  - `PG_SSL_REJECT_UNAUTHORIZED=false` — escape hatch to go back to
 *                        unverified TLS. Deliberately only settable from the
 *                        environment, and it logs a warning.
 */
export function postgresSslOptions(
  env: NodeJS.ProcessEnv = process.env,
): PostgresSslOptions {
  const rejectUnauthorized = env.PG_SSL_REJECT_UNAUTHORIZED !== 'false'

  if (!rejectUnauthorized) {
    console.warn(
      'PG_SSL_REJECT_UNAUTHORIZED=false — the database TLS certificate is NOT ' +
        'being verified. Supply PG_SSL_CA and remove this override.',
    )
  }

  const ca = readCa(env)
  return { rejectUnauthorized, ...(ca ? { ca } : {}) }
}

/** Accept the CA inline (PEM) or as a path to a certificate file. */
function readCa(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.PG_SSL_CA?.trim()
  if (!value) return undefined
  if (value.includes('BEGIN CERTIFICATE')) return value
  return readFileSync(value, 'utf8')
}

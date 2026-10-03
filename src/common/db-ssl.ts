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

/**
 * Accept the CA inline (PEM) or as a path to a certificate file.
 *
 * A malformed value is a startup failure either way, so fail with a message
 * that says which of the two forms was attempted and why it did not work —
 * a bare ENOENT for what the operator believed was a certificate is a
 * genuinely confusing way to lose a deploy.
 */
function readCa(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.PG_SSL_CA?.trim()
  if (!value) return undefined
  if (value.includes('BEGIN CERTIFICATE')) return value

  if (value.includes('\n') || value.length > 1024) {
    throw new Error(
      'PG_SSL_CA looks like certificate data but has no "BEGIN CERTIFICATE" ' +
        'header. Supply the full PEM block, or a path to a .pem file. ' +
        'Most managed providers (Neon included) use publicly-trusted ' +
        'certificates and need no CA at all — leaving PG_SSL_CA unset is fine.',
    )
  }

  try {
    return readFileSync(value, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `PG_SSL_CA was read as a file path and could not be opened: ${reason}. ` +
        'Supply an inline PEM block instead, or unset it — most managed ' +
        'providers use publicly-trusted certificates and need no CA.',
    )
  }
}

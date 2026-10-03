import { postgresSslOptions } from './db-ssl'

describe('postgresSslOptions', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

  afterEach(() => warn.mockClear())

  it('verifies the certificate by default, with no CA', () => {
    expect(postgresSslOptions({})).toEqual({ rejectUnauthorized: true })
  })

  it('needs no CA for a provider with a publicly-trusted certificate', () => {
    // Neon, RDS and friends chain to a root in the system store, so the
    // common case is simply "verification on, nothing else configured".
    const opts = postgresSslOptions({})
    expect(opts.ca).toBeUndefined()
    expect(opts.rejectUnauthorized).toBe(true)
  })

  it('passes an inline PEM through', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----'
    expect(postgresSslOptions({ PG_SSL_CA: pem }).ca).toBe(pem)
  })

  it('only disables verification on an explicit opt-out, and warns', () => {
    const opts = postgresSslOptions({ PG_SSL_REJECT_UNAUTHORIZED: 'false' })
    expect(opts.rejectUnauthorized).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('treats any other value as opting in to verification', () => {
    // Guards against a typo'd 'False' or '0' silently disabling verification.
    for (const value of ['False', '0', 'no', '']) {
      expect(
        postgresSslOptions({ PG_SSL_REJECT_UNAUTHORIZED: value })
          .rejectUnauthorized,
      ).toBe(true)
    }
  })

  it('explains itself when the CA is certificate-shaped but headerless', () => {
    expect(() =>
      postgresSslOptions({ PG_SSL_CA: `MIIByjCCATOg\n${'x'.repeat(40)}` }),
    ).toThrow(/BEGIN CERTIFICATE/)
  })

  it('explains itself when the CA path cannot be opened', () => {
    expect(() => postgresSslOptions({ PG_SSL_CA: '/no/such/ca.pem' })).toThrow(
      /could not be opened/,
    )
  })
})

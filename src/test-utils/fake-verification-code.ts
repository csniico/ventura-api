import type { Provider } from '@nestjs/common'
import { IVerificationCode } from '../auth/domain/verification-code.entity'
import {
  ICreateVerificationCode,
  VERIFICATION_CODE_DATA_SOURCE,
  VerificationCodeRepository,
} from '../auth/domain/verification-code.repository'

/**
 * In-memory `VerificationCodeRepository` for tests. Mirrors the Postgres
 * semantics: `deleteByEmail` clears every code for an email; `findByEmailAndCode`
 * ignores expiry (the service enforces it).
 */
export class FakeVerificationCodeRepository
  implements VerificationCodeRepository
{
  private rows: IVerificationCode[] = []
  private seq = 0

  create(data: ICreateVerificationCode): Promise<IVerificationCode> {
    const now = new Date()
    const record: IVerificationCode = {
      id: `90000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      email: data.email,
      code: data.code,
      expiresAt: data.expiresAt,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.push(record)
    return Promise.resolve({ ...record })
  }
  findByEmailAndCode(
    email: string,
    code: string,
  ): Promise<IVerificationCode | null> {
    const r = this.rows.find((x) => x.email === email && x.code === code)
    return Promise.resolve(r ? { ...r } : null)
  }
  deleteByEmail(email: string): Promise<void> {
    this.rows = this.rows.filter((x) => x.email !== email)
    return Promise.resolve()
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows = []
    this.seq = 0
  }
  _all(): IVerificationCode[] {
    return this.rows.map((r) => ({ ...r }))
  }
  _count(): number {
    return this.rows.length
  }
  /** Force every code for an email into the past (simulates TTL expiry). */
  _forceExpire(email: string): void {
    for (const r of this.rows) {
      if (r.email === email) r.expiresAt = new Date(Date.now() - 1000)
    }
  }
}

/** Provider binding the token to a fresh fake, plus a handle to the store. */
export function fakeVerificationCodeRepositoryProvider(): {
  provider: Provider
  codes: FakeVerificationCodeRepository
} {
  const codes = new FakeVerificationCodeRepository()
  return {
    codes,
    provider: {
      provide: VERIFICATION_CODE_DATA_SOURCE,
      useValue: codes,
    },
  }
}

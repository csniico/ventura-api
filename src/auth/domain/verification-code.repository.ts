import { IVerificationCode } from './verification-code.entity'

/** Fields accepted when storing a fresh verification code. */
export interface ICreateVerificationCode {
  email: string
  code: string
  expiresAt: Date
}

/**
 * Data-access boundary for passwordless sign-in codes. Expiry semantics live in
 * the service; the repository only stores/reads/removes rows.
 */
export interface VerificationCodeRepository {
  create(data: ICreateVerificationCode): Promise<IVerificationCode>
  /** Find a code matching this email + value, or null (ignores expiry). */
  findByEmailAndCode(
    email: string,
    code: string,
  ): Promise<IVerificationCode | null>
  /**
   * The active code for an email, or null. Looked up by email alone so a wrong
   * guess can still be counted against it.
   */
  findByEmail(email: string): Promise<IVerificationCode | null>
  /** Record a failed guess; returns the new attempt count. */
  incrementAttempts(id: string): Promise<number>
  /** Remove every code for an email (replace-before-issue and consume-on-use). */
  deleteByEmail(email: string): Promise<void>
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const VERIFICATION_CODE_DATA_SOURCE = Symbol(
  'VERIFICATION_CODE_DATA_SOURCE',
)

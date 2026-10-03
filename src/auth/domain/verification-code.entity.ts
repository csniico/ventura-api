/**
 * Domain contract for a short-lived passwordless email sign-in code. Expiry is
 * enforced in the service (an expired row is treated as no match); replacing an
 * email's code and consuming it on verify keep the table bounded.
 */
export interface IVerificationCode {
  id: string
  email: string
  code: string
  expiresAt: Date
  /** Failed guesses against this code; the code is locked once exhausted. */
  attempts: number
  createdAt: Date
  updatedAt: Date
}

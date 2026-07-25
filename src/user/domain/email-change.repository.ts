/** A pending email-change request as seen by the domain/service layer. */
export interface IPendingEmailChange {
  userId: string;
  newEmail: string;
  code: string;
  expiresAt: Date;
}

/**
 * Data-access boundary for pending email-change codes. Kept separate from
 * `UserRepository` (ISP) since it maps a different table with its own lifecycle.
 */
export interface EmailChangeRepository {
  /** Remove every pending change for a user (used before writing a fresh one). */
  deleteByUserId(userId: string): Promise<void>;
  create(data: IPendingEmailChange): Promise<void>;
  /** Find a non-expired pending change matching this user + code, or null. */
  findValid(
    userId: string,
    code: string,
    now: Date,
  ): Promise<IPendingEmailChange | null>;
}

export const EMAIL_CHANGE_DATA_SOURCE = Symbol('EMAIL_CHANGE_DATA_SOURCE');

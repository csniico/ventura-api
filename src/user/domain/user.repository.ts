import { IUser, UserRole } from './user.entity';

/** Fields accepted when creating a user. Everything else is defaulted by the DB. */
export interface ICreateUser {
  firstName: string;
  email: string;
  role?: UserRole;
  lastName?: string | null;
  googleId?: string | null;
  appleId?: string | null;
  avatarUrl?: string | null;
  avatarKey?: string | null;
  isEmailVerified?: boolean;
}

/**
 * Partial patch applied to an existing user. A key that is present is written
 * (an explicit `null` clears a nullable column); a key that is absent is left
 * untouched — this is how callers distinguish "clear the field" from
 * "don't change it".
 */
export interface IUpdateUser {
  firstName?: string;
  lastName?: string | null;
  email?: string;
  googleId?: string | null;
  appleId?: string | null;
  password?: string | null;
  hashedRefreshToken?: string | null;
  avatarUrl?: string | null;
  avatarKey?: string | null;
  businessId?: string | null;
  isEmailVerified?: boolean;
  deleted?: boolean;
  deletedAt?: Date | null;
}

/**
 * Data-access boundary for users. Implementations own all persistence detail;
 * business rules (hashing, validation, side effects) live in the service layer.
 * Reads return the full `IUser` (including internal auth fields) — the service
 * decides what is safe to expose.
 */
export interface UserRepository {
  findById(id: string): Promise<IUser | null>;
  findByEmail(email: string): Promise<IUser | null>;
  findByAppleId(appleId: string): Promise<IUser | null>;
  /** All users, newest first (admin listing). */
  list(): Promise<IUser[]>;
  create(data: ICreateUser): Promise<IUser>;
  /** Apply a patch to the user with `id`. Returns null if no such user exists. */
  update(id: string, patch: IUpdateUser): Promise<IUser | null>;
  /** Permanently remove the user. Returns the removed user, or null if none. */
  hardDelete(id: string): Promise<IUser | null>;
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const USER_DATA_SOURCE = Symbol('USER_DATA_SOURCE');

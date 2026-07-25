export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  OPERATOR = 'operator',
  SALES = 'sales',
}

export interface ImageResource {
  fileUrl: string;
  fileKey: string;
}

/**
 * Domain contract for a user. Mirrors the fields exposed by the public API
 * (see `UserResponse`) plus the internal auth fields (`password`,
 * `hashedRefreshToken`) that never leave the service layer. Persistence-nullable
 * columns are surfaced here as optional (`?`) and may be `null`; the application
 * layer decides what reaches the client.
 */
export interface IUser {
  id: string;
  shortId: string;
  role: UserRole;
  firstName: string;
  lastName?: string | null;
  email: string;
  googleId?: string | null;
  appleId?: string | null;
  // Internal auth fields — stripped before any response.
  password?: string | null;
  hashedRefreshToken?: string | null;
  avatarUrl?: string | null;
  avatarKey?: string | null;
  businessId?: string | null;
  isSystem: boolean;
  isActive: boolean;
  isEmailVerified: boolean;
  deleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

import { IUser } from '../domain/user.entity';
import { UserResponse } from '../responses/user.response';

/**
 * Project a domain `IUser` onto the public `UserResponse` contract. This is the
 * single place internal-only fields (`password`, `hashedRefreshToken`, `role`,
 * `appleId`) are dropped, and where the Postgres `id` is surfaced as `_id` so
 * the v2 payload stays shape-compatible with the legacy Mongo response.
 */
export function toUserResponse(user: IUser): UserResponse {
  return {
    _id: user.id,
    shortId: user.shortId,
    firstName: user.firstName,
    lastName: user.lastName ?? null,
    email: user.email,
    googleId: user.googleId ?? null,
    avatarUrl: user.avatarUrl ?? null,
    avatarKey: user.avatarKey ?? null,
    businessId: user.businessId ?? null,
    isSystem: user.isSystem,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    deleted: user.deleted,
    deletedAt: user.deletedAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

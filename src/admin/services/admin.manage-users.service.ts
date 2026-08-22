import { Injectable } from '@nestjs/common';
import { UserServiceV2 } from '../../user/application/user.service';
import { IUser } from '../../user/domain/user.entity';

/**
 * Admin operations performed ON users. All logic (including restore + hard
 * delete, which emit their events) lives in `UserServiceV2`; this service just
 * exposes the admin-only subset so those operations are not surfaced on the
 * public user API.
 */
@Injectable()
export class AdminManageUsersService {
  constructor(private readonly userService: UserServiceV2) {}

  /** List users, newest first. Admin-only. */
  listUsers(): Promise<IUser[]> {
    return this.userService.listUsers();
  }

  /** Get a single user by id. */
  getUserById(userId: string): Promise<IUser> {
    return this.userService.getUserById(userId);
  }

  /** Soft-delete a user's account. */
  softDeleteUser(userId: string): Promise<IUser> {
    return this.userService.deleteAccount(userId);
  }

  /** Restore a soft-deleted user (admin, no reactivation window). */
  restoreUser(userId: string): Promise<IUser> {
    return this.userService.restoreUser(userId);
  }

  /** Permanently remove a user. Returns the removed user, or null if none. */
  hardDeleteUser(userId: string): Promise<IUser | null> {
    return this.userService.hardDeleteUser(userId);
  }
}

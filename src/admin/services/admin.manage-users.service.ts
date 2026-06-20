import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import { UserService } from '../../user/user.service';
import { User, UserDocument } from '../../user/schemas/user.schema';
import { UserEvents, emitUserEvent } from '../../user/events/user.events';

/**
 * Admin operations performed ON users.
 *
 * - Read and soft-delete reuse UserService (no duplicated logic).
 * - Listing, restore, and hard-delete are admin-only and live here, acting
 *   directly on the User model so they are not exposed from the user module.
 */
@Injectable()
export class AdminManageUsersService {
  constructor(
    private readonly userService: UserService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** List users, newest first. Admin-only. */
  async listUsers(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  /** Get a single user by id (delegates to UserService). */
  async getUserById(userId: string): Promise<UserDocument> {
    return this.userService.getUserById(userId);
  }

  /** Soft-delete a user's account (delegates to UserService). */
  async softDeleteUser(userId: string): Promise<UserDocument> {
    return this.userService.deleteAccount(userId);
  }

  /**
   * Restore a soft-deleted user: sets deleted=false and clears deletedAt, then
   * emits 'user.restored'. Admin-only. If the account is not deleted, this is a
   * no-op and no event is emitted.
   */
  async restoreUser(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (!user.deleted) {
      return user;
    }

    user.deleted = false;
    user.deletedAt = null;
    const saved = await user.save();

    emitUserEvent(this.eventEmitter, UserEvents.RESTORED, {
      userId: String(saved._id),
      timestamp: new Date(),
    });
    return saved;
  }

  /**
   * Permanently remove a user document. Admin-only; implemented here directly
   * on the User model so hard-delete is not available on the user module.
   * Emits 'user.permanently_deleted' when a user is actually removed.
   * Returns the removed user, or null if no user had that id.
   */
  async hardDeleteUser(userId: string): Promise<UserDocument | null> {
    const removed = await this.userModel.findByIdAndDelete(userId).exec();
    if (removed) {
      emitUserEvent(this.eventEmitter, UserEvents.PERMANENTLY_DELETED, {
        userId: String(removed._id),
        timestamp: new Date(),
      });
    }
    return removed;
  }
}

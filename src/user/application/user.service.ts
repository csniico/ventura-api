import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { IUser } from '../domain/user.entity';
import { USER_DATA_SOURCE } from '../domain/user.repository';
import type { UserRepository } from '../domain/user.repository';
import { EMAIL_CHANGE_DATA_SOURCE } from '../domain/email-change.repository';
import type { EmailChangeRepository } from '../domain/email-change.repository';
import { FileStorageService } from '../../file-storage/file-storage.service';
import { MailService } from '../../mail/mail.service';
import { UserEvents, emitUserEvent } from '../events/user.events';
import {
  CreateUserWithEmailDto,
  CreateUserWithGoogleDto,
} from '../dto/create-user.dto';
import {
  LinkFieldAction,
  LinkGoogleAccountDto,
} from '../dto/link-google-account.dto';
import { CreatePasswordDto, UpdatePasswordDto } from '../dto/password.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { MessageResponse } from '../responses/user.response';

/**
 * Postgres-backed re-implementation of `UserService`. Same behaviour as the
 * legacy Mongoose service, but every data access goes through the
 * `UserRepository` / `EmailChangeRepository` abstractions (DIP) instead of a
 * Mongoose model. Business rules (hashing, validation, side effects) live here;
 * the repositories only touch the database.
 *
 * Methods return the domain `IUser` (with `id`), so internal callers (auth,
 * admin, business, setup) get a consistent shape. Mapping to the public
 * `UserResponse` happens at the controller boundary.
 */
@Injectable()
export class UserServiceV2 {
  private readonly logger = new Logger(UserServiceV2.name);

  constructor(
    @Inject(USER_DATA_SOURCE)
    private readonly userRepository: UserRepository,
    @Inject(EMAIL_CHANGE_DATA_SOURCE)
    private readonly emailChangeRepository: EmailChangeRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly fileStorageService: FileStorageService,
    private readonly mailService: MailService,
  ) {}

  // How long a pending email-change code stays valid.
  private static readonly EMAIL_CHANGE_TTL_MINUTES = 10;

  // A throwaway argon2 hash used to keep response time roughly constant when no
  // user (or no password) is found, mitigating account-enumeration timing.
  private static readonly DECOY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$sJsT3WFDBZwmGu6gn17DUw$AxZu0VCHkDW04PfhfoyHkgzLx8MaAOemTEYRNwvCj/I';

  /** Generate a 6-digit numeric code (zero-padded), stored as a string. */
  private generateCode(): string {
    // CSPRNG — a predictable code weakens the email-change confirmation flow.
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Canonical email form used for every lookup and write. Trimming + lowercasing
   * here guarantees one account per address regardless of how it was typed.
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async hashPassword(password: string): Promise<string> {
    try {
      return await argon2.hash(password);
    } catch (error) {
      this.logger.error('Error hashing password', error);
      throw new InternalServerErrorException('An unexpected error occurred.');
    }
  }

  /** Find a user by id or throw NotFound. Returns the full domain user. */
  private async getUserOrThrow(userId: string): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  /**
   * Like {@link getUserOrThrow} but rejects soft-deleted accounts, so a deleted
   * account cannot still be mutated (profile/avatar/name/email/business).
   */
  private async getActiveUserOrThrow(userId: string): Promise<IUser> {
    const user = await this.getUserOrThrow(userId);
    if (user.deleted) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  /** Get a single user by id (mapped to the public response). */
  async getUserById(userId: string): Promise<IUser> {
    return await this.getUserOrThrow(userId);
  }

  /** List all users, newest first. Admin-only. */
  async listUsers(): Promise<IUser[]> {
    return this.userRepository.list();
  }

  /**
   * Admin restore of a soft-deleted user: unconditionally clears deleted /
   * deletedAt (no reactivation window) and emits 'user.restored'. If the account
   * is not deleted, this is a no-op and no event is emitted.
   */
  async restoreUser(userId: string): Promise<IUser> {
    const user = await this.getUserOrThrow(userId);
    if (!user.deleted) {
      return user;
    }
    const updated = await this.userRepository.update(userId, {
      deleted: false,
      deletedAt: null,
    });
    const saved = updated ?? user;
    emitUserEvent(this.eventEmitter, UserEvents.RESTORED, {
      userId: saved.id,
      timestamp: new Date(),
    });
    return saved;
  }

  /**
   * Permanently remove a user. Admin-only. Emits 'user.permanently_deleted'
   * when a user is actually removed. Returns the removed user, or null if no
   * user had that id.
   */
  async hardDeleteUser(userId: string): Promise<IUser | null> {
    const removed = await this.userRepository.hardDelete(userId);
    if (removed) {
      emitUserEvent(this.eventEmitter, UserEvents.PERMANENTLY_DELETED, {
        userId: removed.id,
        timestamp: new Date(),
      });
    }
    return removed;
  }

  /** Whether the user has a password set. Throws NotFound if absent. */
  async hasPassword(userId: string): Promise<boolean> {
    const user = await this.getUserOrThrow(userId);
    return !!user.password;
  }

  /** Find a user by email (or null). Used by auth for login lookups. */
  async findByEmail(email: string): Promise<IUser | null> {
    return this.userRepository.findByEmail(this.normalizeEmail(email));
  }

  /**
   * Find an existing user by email, or create one (passwordless email sign-in
   * doubles as sign-up). New users get a firstName from the email local-part.
   */
  async findOrCreateByEmail(
    email: string,
  ): Promise<{ user: IUser; created: boolean }> {
    const normalized = this.normalizeEmail(email);
    const existing = await this.userRepository.findByEmail(normalized);
    if (existing) {
      return { user: existing, created: false };
    }
    const firstName = normalized.split('@')[0] || 'there';
    const user = await this.userRepository.create({
      firstName,
      email: normalized,
    });
    return { user, created: true };
  }

  /** Mark a user's email as verified (used after code verification). */
  async markEmailVerified(userId: string): Promise<void> {
    await this.userRepository.update(userId, { isEmailVerified: true });
  }

  /**
   * Verify an email + password for login. Returns the user on success, or null
   * if the email is unknown, the user has no password, or it's wrong. Always
   * runs an argon2 verify to keep timing roughly constant.
   */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<IUser | null> {
    const user = await this.userRepository.findByEmail(
      this.normalizeEmail(email),
    );

    if (!user || !user.password) {
      await argon2
        .verify(UserServiceV2.DECOY_HASH, password)
        .catch(() => false);
      return null;
    }

    const ok = await argon2.verify(user.password, password).catch(() => false);
    return ok ? user : null;
  }

  /** Store the hashed refresh token for a user (used by auth on login). */
  async setRefreshToken(
    userId: string,
    hashedRefreshToken: string,
  ): Promise<void> {
    await this.userRepository.update(userId, { hashedRefreshToken });
  }

  /** Clear the stored refresh token (used by auth on logout). */
  async clearRefreshToken(userId: string): Promise<void> {
    await this.userRepository.update(userId, { hashedRefreshToken: null });
  }

  /** Read a user's stored hashed refresh token. */
  async getHashedRefreshToken(userId: string): Promise<string | null> {
    const user = await this.userRepository.findById(userId);
    return user?.hashedRefreshToken ?? null;
  }

  /**
   * Email signup. If a user with this email already exists, return it instead
   * of creating a duplicate (email is unique).
   */
  async createWithEmail(dto: CreateUserWithEmailDto): Promise<IUser> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      this.logger.debug(`User with email ${email} already exists.`);
      return existing;
    }

    const user = await this.userRepository.create({
      firstName: dto.firstName,
      email,
    });
    return user;
  }

  /**
   * Google signup ("Continue with Google"). If a user with this email already
   * exists, return it (linking a Google id is handled separately).
   */
  async createWithGoogle(dto: CreateUserWithGoogleDto): Promise<IUser> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      this.logger.debug(`User with email ${email} already exists.`);
      return existing;
    }

    const user = await this.userRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      googleId: dto.googleId,
      avatarUrl: dto.avatarUrl,
      isEmailVerified: true,
    });
    return user;
  }

  /** Find a user by their Apple `sub` (or null). */
  async findByAppleId(appleId: string): Promise<IUser | null> {
    return this.userRepository.findByAppleId(appleId);
  }

  /**
   * Apple sign-in ("Continue with Apple"). Keyed on the stable Apple `sub`:
   * - If a user already has this appleId, return it.
   * - Else, if a user exists with the same email, link the appleId onto it.
   * - Else, create a new account. Apple only sends the name on first auth, so
   *   firstName/lastName may be empty on later sign-ins.
   */
  async createWithApple(params: {
    appleId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<IUser> {
    const existingByApple = await this.userRepository.findByAppleId(
      params.appleId,
    );
    if (existingByApple) return existingByApple;

    const email = this.normalizeEmail(params.email);
    const existingByEmail = await this.userRepository.findByEmail(email);
    if (existingByEmail) {
      const linked = await this.userRepository.update(existingByEmail.id, {
        appleId: params.appleId,
        firstName:
          !existingByEmail.firstName && params.firstName
            ? params.firstName
            : undefined,
        lastName:
          !existingByEmail.lastName && params.lastName
            ? params.lastName
            : undefined,
        isEmailVerified: true,
      });
      return linked ?? existingByEmail;
    }

    const user = await this.userRepository.create({
      firstName: params.firstName || email.split('@')[0] || 'there',
      lastName: params.lastName,
      email,
      appleId: params.appleId,
      isEmailVerified: true,
    });
    return user;
  }

  /**
   * Link a Google account to an existing user (found by email).
   * - googleId is always attached.
   * - firstName / lastName / avatarUrl are applied unless the matching
   *   preference is `keep`. Any field not listed defaults to `update`.
   * - Throws NotFound if no user has this email; Conflict if already linked to a
   *   different googleId.
   */
  async linkGoogleAccount(dto: LinkGoogleAccountDto): Promise<IUser> {
    const user = await this.userRepository.findByEmail(
      this.normalizeEmail(dto.email),
    );
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.googleId && user.googleId !== dto.googleId) {
      throw new ConflictException(
        'This account is already linked to a different Google account.',
      );
    }

    const prefs = dto.preferences ?? {};
    // A field is updated from the payload unless explicitly set to `keep`.
    const shouldUpdate = (action?: LinkFieldAction) =>
      action !== LinkFieldAction.KEEP;

    const patch = {
      googleId: dto.googleId,
      isEmailVerified: true,
      ...(shouldUpdate(prefs.firstName) && dto.firstName !== undefined
        ? { firstName: dto.firstName }
        : {}),
      ...(shouldUpdate(prefs.lastName) && dto.lastName !== undefined
        ? { lastName: dto.lastName }
        : {}),
      ...(shouldUpdate(prefs.avatarUrl) && dto.avatarUrl !== undefined
        ? { avatarUrl: dto.avatarUrl }
        : {}),
    };

    const updated = await this.userRepository.update(user.id, patch);
    return updated ?? user;
  }

  /**
   * Create a password for a user who does not have one yet. Located by
   * userId + email together.
   * - Throws NotFound if no user matches that userId + email.
   * - Throws Conflict if the user already has a password.
   */
  async createPassword(dto: CreatePasswordDto): Promise<IUser> {
    const user = await this.userRepository.findById(dto.userId);
    if (!user || user.deleted || user.email !== this.normalizeEmail(dto.email)) {
      throw new NotFoundException('User not found.');
    }
    if (user.password) {
      throw new ConflictException(
        'A password already exists for this account. Use update password instead.',
      );
    }

    const password = await this.hashPassword(dto.newPassword);
    const updated = await this.userRepository.update(user.id, { password });
    return updated ?? user;
  }

  /**
   * Update an existing password. Verifies the current password with argon2
   * before setting the new one. Located by userId + email together.
   * - Throws NotFound if no user matches, or the user has no password set.
   * - Throws BadRequest if the old password does not match.
   */
  async updatePassword(dto: UpdatePasswordDto): Promise<IUser> {
    const user = await this.userRepository.findById(dto.userId);
    if (
      !user ||
      user.deleted ||
      user.email !== this.normalizeEmail(dto.email) ||
      !user.password
    ) {
      throw new NotFoundException('User not found.');
    }

    const isMatch = await argon2.verify(user.password, dto.oldPassword);
    if (!isMatch) {
      throw new BadRequestException('Old password does not match.');
    }

    const password = await this.hashPassword(dto.newPassword);
    const updated = await this.userRepository.update(user.id, { password });
    return updated ?? user;
  }

  /**
   * Attach a business to a user by setting their businessId.
   * - Throws NotFound if no user has that id.
   * - Throws Conflict if the user already has a businessId.
   */
  async setBusinessId(userId: string, businessId: string): Promise<IUser> {
    const user = await this.getActiveUserOrThrow(userId);
    if (user.businessId) {
      throw new ConflictException('id already exists');
    }

    const updated = await this.userRepository.update(userId, { businessId });
    return updated ?? user;
  }

  /** Update a user's first name. */
  async updateFirstName(userId: string, firstName: string): Promise<IUser> {
    await this.getActiveUserOrThrow(userId);
    const updated = await this.userRepository.update(userId, { firstName });
    if (!updated) {
      throw new NotFoundException('User not found.');
    }
    return updated;
  }

  /** Update a user's last name. Pass null to clear it. */
  async updateLastName(
    userId: string,
    lastName: string | null,
  ): Promise<IUser> {
    await this.getActiveUserOrThrow(userId);
    const updated = await this.userRepository.update(userId, {
      lastName: lastName ?? null,
    });
    if (!updated) {
      throw new NotFoundException('User not found.');
    }
    return updated;
  }

  /**
   * Best-effort cleanup of a replaced S3 asset. Never throws — a storage hiccup
   * must not block the profile update that triggered it.
   */
  private async deleteOldAsset(
    oldKey: string | null | undefined,
    newKey: string | null,
  ): Promise<void> {
    if (!oldKey || oldKey === newKey) {
      return;
    }
    try {
      await this.fileStorageService.deleteFile(oldKey);
    } catch (error) {
      this.logger.error(`Failed to delete old asset ${oldKey}`, error);
    }
  }

  /**
   * Update a user's avatar (public URL + S3 object key). Pass null for both to
   * clear it. When the key changes, the previously stored object is deleted
   * from S3 (best-effort).
   */
  async updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarKey: string | null,
  ): Promise<IUser> {
    const user = await this.getActiveUserOrThrow(userId);
    const oldKey = user.avatarKey;

    const updated = await this.userRepository.update(userId, {
      avatarUrl,
      avatarKey,
    });

    await this.deleteOldAsset(oldKey, avatarKey);
    return updated ?? user;
  }

  /**
   * Bulk profile update. Only fields present in the DTO change; lastName and
   * avatarUrl may be set to null to clear them.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<IUser> {
    await this.getActiveUserOrThrow(userId);
    const patch = {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName ?? null } : {}),
      ...(dto.avatarUrl !== undefined
        ? { avatarUrl: dto.avatarUrl ?? null }
        : {}),
    };

    const updated = await this.userRepository.update(userId, patch);
    if (!updated) {
      throw new NotFoundException('User not found.');
    }
    return updated;
  }

  /**
   * Soft-delete a user's own account: sets deleted=true and deletedAt=now, then
   * emits 'user.deleted'. If already deleted, this is a no-op (no event).
   */
  async deleteAccount(userId: string): Promise<IUser> {
    const user = await this.getUserOrThrow(userId);
    if (user.deleted) {
      return user;
    }

    const updated = await this.userRepository.update(userId, {
      deleted: true,
      deletedAt: new Date(),
    });
    const saved = updated ?? user;

    emitUserEvent(this.eventEmitter, UserEvents.DELETED, {
      userId: saved.id,
      timestamp: new Date(),
    });
    return saved;
  }

  /**
   * Self-service reactivation on sign-in. No-op if not soft-deleted. If deleted
   * within `windowDays`, restores the account and emits 'user.restored'. If the
   * window has passed, throws Forbidden.
   */
  async reactivateIfWithinWindow(
    userId: string,
    windowDays = 90,
  ): Promise<{ reactivated: boolean }> {
    const user = await this.getUserOrThrow(userId);
    if (!user.deleted) {
      return { reactivated: false };
    }

    const deletedAt = user.deletedAt ? user.deletedAt.getTime() : 0;
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const withinWindow = Date.now() - deletedAt <= windowMs;

    if (!withinWindow) {
      // Generic 401 (same as a bad password) so an expired-deleted account is
      // indistinguishable from invalid credentials — no account-existence or
      // status-code oracle on the sign-in path.
      throw new UnauthorizedException('Invalid credentials.');
    }

    const saved = await this.userRepository.update(userId, {
      deleted: false,
      deletedAt: null,
    });

    emitUserEvent(this.eventEmitter, UserEvents.RESTORED, {
      userId: (saved ?? user).id,
      timestamp: new Date(),
    });
    return { reactivated: true };
  }

  // --- Email change (OTP verified) ---

  /**
   * Step 1 of an email change. Validates the requested address, generates a
   * 6-digit code, stores it as a pending change (replacing any prior one), and
   * emails the code to the NEW address.
   * - Throws NotFound if the user doesn't exist.
   * - Throws BadRequest if the new email equals the current one.
   * - Throws Conflict if the new email is already used by another user.
   */
  async requestEmailChange(
    userId: string,
    newEmail: string,
  ): Promise<MessageResponse> {
    const user = await this.getActiveUserOrThrow(userId);
    const normalized = this.normalizeEmail(newEmail);

    if (normalized === user.email) {
      throw new BadRequestException(
        'New email is the same as the current email.',
      );
    }

    const existing = await this.userRepository.findByEmail(normalized);
    if (existing && existing.id !== user.id) {
      throw new ConflictException('Email already in use.');
    }

    const code = this.generateCode();
    const expiresAt = new Date(
      Date.now() + UserServiceV2.EMAIL_CHANGE_TTL_MINUTES * 60 * 1000,
    );

    // Replace any prior pending change for this user.
    await this.emailChangeRepository.deleteByUserId(user.id);
    await this.emailChangeRepository.create({
      userId: user.id,
      newEmail: normalized,
      code,
      expiresAt,
    });

    await this.mailService.sendVerificationCode(
      normalized,
      code,
      UserServiceV2.EMAIL_CHANGE_TTL_MINUTES,
    );

    return {
      message: 'A verification code has been sent to the new email address.',
    };
  }

  /**
   * Step 2 of an email change. Verifies the emailed code against a non-expired
   * pending change, swaps the user's email, and clears the pending record.
   * - Throws BadRequest if no matching, non-expired code exists.
   * - Throws Conflict if the new email got taken in the meantime (race).
   */
  async confirmEmailChange(userId: string, code: string): Promise<IUser> {
    const pending = await this.emailChangeRepository.findValid(
      userId,
      code,
      new Date(),
    );
    if (!pending) {
      throw new BadRequestException('Invalid or expired code.');
    }

    const user = await this.getActiveUserOrThrow(userId);

    // Re-check the target address wasn't claimed by someone else in the meantime.
    const existing = await this.userRepository.findByEmail(pending.newEmail);
    if (existing && existing.id !== user.id) {
      throw new ConflictException('Email already in use.');
    }

    const updated = await this.userRepository.update(user.id, {
      email: pending.newEmail,
    });

    await this.emailChangeRepository.deleteByUserId(userId);
    return updated ?? user;
  }
}

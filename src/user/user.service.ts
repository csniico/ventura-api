import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { User, UserDocument } from './schemas/user.schema';
import { UserEvents, emitUserEvent } from './events/user.events';
import {
  CreateUserWithEmailDto,
  CreateUserWithGoogleDto,
} from './dto/create-user.dto';
import {
  LinkFieldAction,
  LinkGoogleAccountDto,
} from './dto/link-google-account.dto';
import { CreatePasswordDto, UpdatePasswordDto } from './dto/password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { FileStorageService } from '../file-storage/file-storage.service';
import {
  EmailChange,
  EmailChangeDocument,
} from './schemas/email-change.schema';
import { MailService } from '../mail/mail.service';
import { MessageResponse } from './responses/user.response';

// A plain user object with the password field removed.
export type SafeUser = Omit<User, 'password'>;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(EmailChange.name)
    private readonly emailChangeModel: Model<EmailChangeDocument>,
    private readonly eventEmitter: EventEmitter2,
    private readonly fileStorageService: FileStorageService,
    private readonly mailService: MailService,
  ) {}

  // How long a pending email-change code stays valid.
  private static readonly EMAIL_CHANGE_TTL_MINUTES = 10;

  /** Generate a 6-digit numeric code (zero-padded), stored as a string. */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Canonical email form used for every lookup and write. Emails are
   * case-insensitive but the unique index is case-sensitive, so trimming +
   * lowercasing here is what guarantees one account per address regardless of
   * how it was typed or which provider returned it. Mirrors the DTO-level
   * `@NormalizeEmail()` so non-DTO callers (e.g. the Google idToken payload)
   * stay consistent too.
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Get a single user by _id. Throws NotFound if it doesn't exist. */
  async getUserById(userId: string): Promise<UserDocument> {
    return this.getUserOrThrow(userId);
  }

  /**
   * Whether the user has a password set. `password` is select:false, so it must
   * be explicitly selected to check. Throws NotFound if the user doesn't exist.
   */
  async hasPassword(userId: string): Promise<boolean> {
    const user = await this.userModel
      .findById(userId)
      .select('+password')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return !!user.password;
  }

  /** Find a user by email (or null). Used by auth for login lookups. */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: this.normalizeEmail(email) }).exec();
  }

  /**
   * Find an existing user by email, or create one (passwordless email sign-in
   * doubles as sign-up). New users get a firstName derived from the email
   * local-part, which they can change later.
   * Returns the user and whether it was just created.
   */
  async findOrCreateByEmail(
    email: string,
  ): Promise<{ user: UserDocument; created: boolean }> {
    const normalized = this.normalizeEmail(email);
    const existing = await this.userModel.findOne({ email: normalized }).exec();
    if (existing) {
      return { user: existing, created: false };
    }
    const firstName = normalized.split('@')[0] || 'there';
    const user = await this.userModel.create({ firstName, email: normalized });
    return { user, created: true };
  }

  /** Mark a user's email as verified (used after code verification). */
  async markEmailVerified(userId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { isEmailVerified: true })
      .exec();
  }

  // A throwaway argon2 hash used to keep response time roughly constant when
  // no user (or no password) is found, mitigating account-enumeration timing.
  private static readonly DECOY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$sJsT3WFDBZwmGu6gn17DUw$AxZu0VCHkDW04PfhfoyHkgzLx8MaAOemTEYRNwvCj/I';

  /**
   * Verify an email + password for login. Returns the user on success, or null
   * if the email is unknown, the user has no password, or the password is wrong.
   * Always runs an argon2 verify to keep timing roughly constant.
   */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<UserDocument | null> {
    const user = await this.userModel
      .findOne({ email: this.normalizeEmail(email) })
      .select('+password')
      .exec();

    if (!user || !user.password) {
      await argon2.verify(UserService.DECOY_HASH, password).catch(() => false);
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
    await this.userModel
      .updateOne({ _id: userId }, { hashedRefreshToken })
      .exec();
  }

  /** Clear the stored refresh token (used by auth on logout). */
  async clearRefreshToken(userId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { hashedRefreshToken: null })
      .exec();
  }

  /** Read a user's stored hashed refresh token (select:false field). */
  async getHashedRefreshToken(userId: string): Promise<string | null> {
    const user = await this.userModel
      .findById(userId)
      .select('+hashedRefreshToken')
      .exec();
    return user?.hashedRefreshToken ?? null;
  }

  /**
   * Email signup. If a user with this email already exists, return it
   * instead of creating a duplicate (email is unique).
   */
  async createWithEmail(dto: CreateUserWithEmailDto): Promise<UserDocument> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      this.logger.debug(`User with email ${email} already exists.`);
      return existing;
    }

    return this.userModel.create({
      firstName: dto.firstName,
      email,
    });
  }

  /**
   * Google signup ("Continue with Google"). Values come from the Google
   * payload. If a user with this email already exists, return it (linking a
   * Google id to an existing account is handled by a separate service).
   */
  async createWithGoogle(dto: CreateUserWithGoogleDto): Promise<UserDocument> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      this.logger.debug(`User with email ${email} already exists.`);
      return existing;
    }

    return this.userModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      googleId: dto.googleId,
      avatarUrl: dto.avatarUrl,
      isEmailVerified: true,
    });
  }

  /** Find a user by their Apple `sub` (or null). */
  async findByAppleId(appleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ appleId }).exec();
  }

  /**
   * Apple sign-in ("Continue with Apple"). Keyed on the stable Apple `sub`:
   * - If a user already has this [appleId], return it.
   * - Else, if a user exists with the same email, link the [appleId] onto it.
   * - Else, create a new account. Apple only sends the name on the first
   *   authorization, so [firstName]/[lastName] may be empty on later sign-ins.
   */
  async createWithApple(params: {
    appleId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<UserDocument> {
    const existingByApple = await this.userModel
      .findOne({ appleId: params.appleId })
      .exec();
    if (existingByApple) return existingByApple;

    const email = this.normalizeEmail(params.email);
    const existingByEmail = await this.userModel.findOne({ email }).exec();
    if (existingByEmail) {
      existingByEmail.appleId = params.appleId;
      if (!existingByEmail.firstName && params.firstName) {
        existingByEmail.firstName = params.firstName;
      }
      if (!existingByEmail.lastName && params.lastName) {
        existingByEmail.lastName = params.lastName;
      }
      existingByEmail.isEmailVerified = true;
      return existingByEmail.save();
    }

    return this.userModel.create({
      firstName: params.firstName || email.split('@')[0] || 'there',
      lastName: params.lastName,
      email,
      appleId: params.appleId,
      isEmailVerified: true,
    });
  }

  /**
   * Link a Google account to an existing user (found by email).
   *
   * - googleId is always attached.
   * - For firstName / lastName / avatarUrl, the value from the Google payload
   *   is applied unless the matching preference is `keep`. Any field not listed
   *   in `preferences` defaults to `update`.
   * - Throws NotFound if no user has this email.
   * - If the user is already linked to the SAME googleId, it's a no-op for the
   *   id but preferences are still applied. A DIFFERENT googleId throws Conflict.
   */
  async linkGoogleAccount(dto: LinkGoogleAccountDto): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ email: this.normalizeEmail(dto.email) })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.googleId && user.googleId !== dto.googleId) {
      throw new ConflictException(
        'This account is already linked to a different Google account.',
      );
    }

    user.googleId = dto.googleId;

    const prefs = dto.preferences ?? {};
    // A field is updated from the payload unless explicitly set to `keep`.
    const shouldUpdate = (action?: LinkFieldAction) =>
      action !== LinkFieldAction.KEEP;

    if (shouldUpdate(prefs.firstName) && dto.firstName !== undefined) {
      user.firstName = dto.firstName;
    }
    if (shouldUpdate(prefs.lastName) && dto.lastName !== undefined) {
      user.lastName = dto.lastName;
    }
    if (shouldUpdate(prefs.avatarUrl) && dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl;
    }

    user.isEmailVerified = true;
    return user.save();
  }

  private async hashPassword(password: string): Promise<string> {
    try {
      return await argon2.hash(password);
    } catch (error) {
      this.logger.error('Error hashing password', error);
      throw new InternalServerErrorException('An unexpected error occurred.');
    }
  }

  private stripPassword(user: UserDocument): SafeUser {
    const obj = user.toObject();
    delete obj.password;
    return obj;
  }

  /**
   * Create a password for a user who does not have one yet.
   * Looks the user up by userId + email together.
   * - Throws NotFound if no user matches that userId + email.
   * - Throws Conflict if the user already has a password (use updatePassword).
   */
  async createPassword(dto: CreatePasswordDto): Promise<SafeUser> {
    const user = await this.userModel
      .findOne({ _id: dto.userId, email: this.normalizeEmail(dto.email) })
      .select('+password')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (user.password) {
      throw new ConflictException(
        'A password already exists for this account. Use update password instead.',
      );
    }

    user.password = await this.hashPassword(dto.newPassword);
    await user.save();
    return this.stripPassword(user);
  }

  /**
   * Update an existing password. Verifies the current password with argon2
   * before setting the new one. Looks the user up by userId + email together.
   * - Throws NotFound if no user matches, or the user has no password set.
   * - Throws BadRequest if the old password does not match.
   */
  async updatePassword(dto: UpdatePasswordDto): Promise<SafeUser> {
    const user = await this.userModel
      .findOne({ _id: dto.userId, email: this.normalizeEmail(dto.email) })
      .select('+password')
      .exec();
    if (!user || !user.password) {
      throw new NotFoundException('User not found.');
    }

    const isMatch = await argon2.verify(user.password, dto.oldPassword);
    if (!isMatch) {
      throw new BadRequestException('Old password does not match.');
    }

    user.password = await this.hashPassword(dto.newPassword);
    await user.save();
    return this.stripPassword(user);
  }

  /**
   * Attach a business to a user by setting their businessId.
   * Looks the user up by _id.
   * - Throws NotFound if no user has that id.
   * - Throws Conflict (409) if the user already has a businessId.
   */
  async setBusinessId(
    userId: string,
    businessId: string,
  ): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (user.businessId) {
      throw new ConflictException('id already exists');
    }

    user.businessId = businessId;
    return user.save();
  }

  /** Find a user by _id or throw NotFound. */
  private async getUserOrThrow(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  /** Update a user's first name. */
  async updateFirstName(
    userId: string,
    firstName: string,
  ): Promise<UserDocument> {
    const user = await this.getUserOrThrow(userId);
    user.firstName = firstName;
    return user.save();
  }

  /** Update a user's last name. Pass null to clear it. */
  async updateLastName(
    userId: string,
    lastName: string | null,
  ): Promise<UserDocument> {
    const user = await this.getUserOrThrow(userId);
    user.lastName = lastName ?? undefined;
    return user.save();
  }

  /**
   * Best-effort cleanup of a replaced S3 asset. Never throws — a storage
   * hiccup must not block the profile update that triggered it.
   */
  private async deleteOldAsset(
    oldKey: string | undefined,
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
   * Update a user's avatar from an uploaded file: stores both the public URL
   * and the S3 object key. Pass null for both to clear the avatar. When the key
   * changes, the previously stored object is deleted from S3 (best-effort).
   */
  async updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarKey: string | null,
  ): Promise<UserDocument> {
    const user = await this.getUserOrThrow(userId);
    const oldKey = user.avatarKey;

    user.avatarUrl = avatarUrl ?? undefined;
    user.avatarKey = avatarKey ?? undefined;
    const saved = await user.save();

    await this.deleteOldAsset(oldKey, avatarKey);
    return saved;
  }

  /**
   * Bulk profile update. Only the fields present in the DTO are changed;
   * lastName and avatarUrl may be set to null to clear them.
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserDocument> {
    const user = await this.getUserOrThrow(userId);

    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName ?? undefined;
    }
    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl ?? undefined;
    }

    return user.save();
  }

  /**
   * Soft-delete a user's own account: sets deleted=true and deletedAt=now,
   * then emits 'user.deleted'. If the account is already deleted, this is a
   * no-op and no event is emitted.
   */
  async deleteAccount(userId: string): Promise<UserDocument> {
    const user = await this.getUserOrThrow(userId);
    if (user.deleted) {
      return user;
    }

    user.deleted = true;
    user.deletedAt = new Date();
    const saved = await user.save();

    emitUserEvent(this.eventEmitter, UserEvents.DELETED, {
      userId: String(saved._id),
      timestamp: new Date(),
    });
    return saved;
  }

  /**
   * Self-service reactivation on sign-in. If the user is not soft-deleted this
   * is a no-op. If it is deleted and the deletion happened within `windowDays`,
   * the account is restored (deleted=false, deletedAt cleared) and a
   * 'user.restored' event is emitted. If the window has already passed, throws
   * Forbidden so the sign-in fails.
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
      throw new ForbiddenException(
        'Account deletion window has passed; the account can no longer be restored.',
      );
    }

    user.deleted = false;
    user.deletedAt = null;
    const saved = await user.save();

    emitUserEvent(this.eventEmitter, UserEvents.RESTORED, {
      userId: String(saved._id),
      timestamp: new Date(),
    });
    return { reactivated: true };
  }

  // --- Email change (OTP verified) ---

  /**
   * Step 1 of an email change. Validates the requested address, generates a
   * 6-digit code, stores it as a pending EmailChange (replacing any prior
   * pending change for this user), and emails the code to the NEW address.
   * - Throws NotFound if the user doesn't exist.
   * - Throws BadRequest if the new email equals the current one.
   * - Throws Conflict if the new email is already used by another user.
   */
  async requestEmailChange(
    userId: string,
    newEmail: string,
  ): Promise<MessageResponse> {
    const user = await this.getUserById(userId);
    const normalized = this.normalizeEmail(newEmail);

    if (normalized === user.email) {
      throw new BadRequestException(
        'New email is the same as the current email.',
      );
    }

    const existing = await this.userModel.findOne({ email: normalized }).exec();
    if (existing && String(existing._id) !== String(user._id)) {
      throw new ConflictException('Email already in use.');
    }

    const code = this.generateCode();
    const expiresAt = new Date(
      Date.now() + UserService.EMAIL_CHANGE_TTL_MINUTES * 60 * 1000,
    );

    // Replace any prior pending change for this user.
    await this.emailChangeModel.deleteMany({ userId: String(user._id) }).exec();
    await this.emailChangeModel.create({
      userId: String(user._id),
      newEmail: normalized,
      code,
      expiresAt,
    });

    await this.mailService.sendVerificationCode(
      normalized,
      code,
      UserService.EMAIL_CHANGE_TTL_MINUTES,
    );

    return {
      message: 'A verification code has been sent to the new email address.',
    };
  }

  /**
   * Step 2 of an email change. Verifies the emailed code against a non-expired
   * pending EmailChange, swaps the user's email, and clears the pending record.
   * - Throws BadRequest if no matching, non-expired code exists.
   * - Throws Conflict if the new email got taken in the meantime (race).
   */
  async confirmEmailChange(
    userId: string,
    code: string,
  ): Promise<UserDocument> {
    const pending = await this.emailChangeModel
      .findOne({ userId, code, expiresAt: { $gt: new Date() } })
      .exec();
    if (!pending) {
      throw new BadRequestException('Invalid or expired code.');
    }

    const user = await this.getUserById(userId);

    // Re-check the target address wasn't claimed by someone else in the meantime.
    const existing = await this.userModel
      .findOne({ email: pending.newEmail })
      .exec();
    if (existing && String(existing._id) !== String(user._id)) {
      throw new ConflictException('Email already in use.');
    }

    user.email = pending.newEmail;
    const saved = await user.save();

    await this.emailChangeModel.deleteMany({ userId }).exec();
    return saved;
  }
}

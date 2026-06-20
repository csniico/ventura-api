import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { UserService } from './user.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { User, UserDocument, UserSchema } from './schemas/user.schema';
import {
  EmailChange,
  EmailChangeDocument,
  EmailChangeSchema,
} from './schemas/email-change.schema';
import { MailService } from '../mail/mail.service';
import { LinkFieldAction } from './dto/link-google-account.dto';
import { UserEvents } from './events/user.events';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { resolveTestUri } from '../test-utils/test-db';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';

describe('UserService (integration, real MongoDB)', () => {
  let moduleRef: TestingModule;
  let service: UserService;
  let userModel: Model<UserDocument>;
  let emailChangeModel: Model<EmailChangeDocument>;
  let connection: Connection;
  let eventEmitter: EventEmitter2;
  let fileStorage: { deleteFile: jest.Mock };
  let mail: { sendVerificationCode: jest.Mock; sendWelcome: jest.Mock };

  beforeAll(async () => {
    const uri = resolveTestUri('user');

    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: EmailChange.name, schema: EmailChangeSchema },
        ]),
      ],
      providers: [
        UserService,
        mockFileStorageProvider,
        {
          provide: MailService,
          useValue: {
            sendVerificationCode: jest.fn(),
            sendWelcome: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<UserService>(UserService);
    userModel = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));
    emailChangeModel = moduleRef.get<Model<EmailChangeDocument>>(
      getModelToken(EmailChange.name),
    );
    connection = moduleRef.get<Connection>(getConnectionToken());
    eventEmitter = moduleRef.get<EventEmitter2>(EventEmitter2);
    fileStorage = moduleRef.get(FileStorageService);
    mail = moduleRef.get(MailService);
  });

  // Start each test from an empty users collection.
  beforeEach(async () => {
    await userModel.deleteMany({});
    await emailChangeModel.deleteMany({});
    fileStorage.deleteFile.mockClear();
    mail.sendVerificationCode.mockClear();
    mail.sendWelcome.mockClear();
  });

  afterAll(async () => {
    await userModel.deleteMany({});
    await emailChangeModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  describe('createWithEmail', () => {
    it('persists a new user and can be read back from the database', async () => {
      const created = await service.createWithEmail({
        firstName: 'Ada',
        email: 'ada@example.com',
      });

      // Returned document looks right.
      expect(created._id).toBeDefined();
      expect(created.firstName).toBe('Ada');
      expect(created.email).toBe('ada@example.com');
      expect(created.shortId).toHaveLength(8);

      // Independently query the database to confirm it was actually written.
      const fromDb = await userModel.findById(created._id).exec();
      expect(fromDb).not.toBeNull();
      expect(fromDb?.email).toBe('ada@example.com');
      expect(fromDb?.firstName).toBe('Ada');
      // No password at email-signup stage.
      expect(fromDb?.password).toBeUndefined();

      const count = await userModel.countDocuments();
      expect(count).toBe(1);
    });

    it('returns the existing user and does not create a duplicate', async () => {
      const first = await service.createWithEmail({
        firstName: 'Ada',
        email: 'dupe@example.com',
      });

      const second = await service.createWithEmail({
        firstName: 'Different Name',
        email: 'dupe@example.com',
      });

      // Same record returned, original data untouched.
      expect(String(second._id)).toBe(String(first._id));
      expect(second.firstName).toBe('Ada');

      const count = await userModel.countDocuments({
        email: 'dupe@example.com',
      });
      expect(count).toBe(1);
    });
  });

  describe('createWithGoogle', () => {
    it('persists a Google user with payload fields and verified email', async () => {
      const created = await service.createWithGoogle({
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        googleId: 'google-123',
        avatarUrl: 'https://example.com/a.png',
      });

      const fromDb = await userModel.findById(created._id).exec();
      expect(fromDb).not.toBeNull();
      expect(fromDb?.firstName).toBe('Grace');
      expect(fromDb?.lastName).toBe('Hopper');
      expect(fromDb?.email).toBe('grace@example.com');
      expect(fromDb?.googleId).toBe('google-123');
      expect(fromDb?.avatarUrl).toBe('https://example.com/a.png');
      expect(fromDb?.isEmailVerified).toBe(true);
    });

    it('persists when optional lastName/avatarUrl are absent', async () => {
      const created = await service.createWithGoogle({
        firstName: 'Linus',
        email: 'linus@example.com',
        googleId: 'google-456',
      });

      const fromDb = await userModel.findById(created._id).exec();
      expect(fromDb?.googleId).toBe('google-456');
      expect(fromDb?.lastName).toBeNull();
      expect(fromDb?.avatarUrl).toBeNull();
      expect(fromDb?.isEmailVerified).toBe(true);
    });

    it('returns the existing user on duplicate email without creating a duplicate', async () => {
      await service.createWithEmail({
        firstName: 'Existing',
        email: 'shared@example.com',
      });

      const viaGoogle = await service.createWithGoogle({
        firstName: 'Google Name',
        email: 'shared@example.com',
        googleId: 'google-789',
      });

      // Existing email-only record returned; google id NOT attached (linking is separate).
      expect(viaGoogle.firstName).toBe('Existing');
      expect(viaGoogle.googleId).toBeUndefined();

      const count = await userModel.countDocuments({
        email: 'shared@example.com',
      });
      expect(count).toBe(1);
    });
  });

  describe('linkGoogleAccount', () => {
    it('throws NotFound when no user has that email', async () => {
      await expect(
        service.linkGoogleAccount({
          email: 'nobody@example.com',
          googleId: 'google-x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('attaches googleId and updates fields from the payload by default', async () => {
      await service.createWithEmail({
        firstName: 'Original',
        email: 'link@example.com',
      });

      await service.linkGoogleAccount({
        email: 'link@example.com',
        googleId: 'google-link-1',
        firstName: 'GoogleFirst',
        lastName: 'GoogleLast',
        avatarUrl: 'https://example.com/g.png',
        // no preferences -> everything defaults to update
      });

      const fromDb = await userModel
        .findOne({ email: 'link@example.com' })
        .exec();
      expect(fromDb?.googleId).toBe('google-link-1');
      expect(fromDb?.firstName).toBe('GoogleFirst');
      expect(fromDb?.lastName).toBe('GoogleLast');
      expect(fromDb?.avatarUrl).toBe('https://example.com/g.png');
      expect(fromDb?.isEmailVerified).toBe(true);
    });

    it('honors per-field keep/update preferences', async () => {
      await service.createWithEmail({
        firstName: 'KeepMe',
        email: 'prefs@example.com',
      });

      await service.linkGoogleAccount({
        email: 'prefs@example.com',
        googleId: 'google-link-2',
        firstName: 'GoogleFirst',
        lastName: 'GoogleLast',
        avatarUrl: 'https://example.com/g.png',
        preferences: {
          firstName: LinkFieldAction.KEEP,
          lastName: LinkFieldAction.UPDATE,
          // avatarUrl omitted -> defaults to update
        },
      });

      const fromDb = await userModel
        .findOne({ email: 'prefs@example.com' })
        .exec();
      expect(fromDb?.firstName).toBe('KeepMe'); // kept
      expect(fromDb?.lastName).toBe('GoogleLast'); // updated
      expect(fromDb?.avatarUrl).toBe('https://example.com/g.png'); // default update
      expect(fromDb?.googleId).toBe('google-link-2');
    });

    it('is a no-op for googleId when the same id is already linked, but still applies prefs', async () => {
      await service.createWithGoogle({
        firstName: 'Grace',
        email: 'samegoogle@example.com',
        googleId: 'google-same',
      });

      const result = await service.linkGoogleAccount({
        email: 'samegoogle@example.com',
        googleId: 'google-same',
        firstName: 'Updated',
      });

      expect(result.googleId).toBe('google-same');
      expect(result.firstName).toBe('Updated');
    });

    it('throws Conflict when a different googleId is already linked', async () => {
      await service.createWithGoogle({
        firstName: 'Grace',
        email: 'conflict@example.com',
        googleId: 'google-original',
      });

      await expect(
        service.linkGoogleAccount({
          email: 'conflict@example.com',
          googleId: 'google-different',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createPassword', () => {
    const password = 'sup3r-Secret!pw';

    it('sets a hashed password for a user that has none, and hides it in the result', async () => {
      const user = await service.createWithEmail({
        firstName: 'Pass',
        email: 'setpw@example.com',
      });

      const result = await service.createPassword({
        userId: String(user._id),
        email: 'setpw@example.com',
        newPassword: password,
      });

      // Returned object has no password field.
      expect((result as { password?: string }).password).toBeUndefined();

      // Stored value is a hash (not the plaintext) and verifies with argon2.
      const fromDb = await userModel
        .findById(user._id)
        .select('+password')
        .exec();
      expect(fromDb?.password).toBeDefined();
      expect(fromDb?.password).not.toBe(password);
      expect(await argon2.verify(fromDb!.password!, password)).toBe(true);
    });

    it('throws NotFound when userId + email do not match the same user', async () => {
      const user = await service.createWithEmail({
        firstName: 'Pass',
        email: 'mismatch@example.com',
      });

      await expect(
        service.createPassword({
          userId: String(user._id),
          email: 'someone-else@example.com',
          newPassword: password,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Conflict when the user already has a password', async () => {
      const user = await service.createWithEmail({
        firstName: 'Pass',
        email: 'already@example.com',
      });
      await service.createPassword({
        userId: String(user._id),
        email: 'already@example.com',
        newPassword: password,
      });

      await expect(
        service.createPassword({
          userId: String(user._id),
          email: 'already@example.com',
          newPassword: 'an0ther-Secret!pw',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updatePassword', () => {
    const oldPassword = 'old-Passw0rd!xx';
    const newPassword = 'new-Passw0rd!yy';

    async function seedUserWithPassword(email: string) {
      const user = await service.createWithEmail({ firstName: 'Up', email });
      await service.createPassword({
        userId: String(user._id),
        email,
        newPassword: oldPassword,
      });
      return user;
    }

    it('replaces the password when the old password matches', async () => {
      const user = await seedUserWithPassword('update@example.com');

      await service.updatePassword({
        userId: String(user._id),
        email: 'update@example.com',
        oldPassword,
        newPassword,
      });

      const fromDb = await userModel
        .findById(user._id)
        .select('+password')
        .exec();
      expect(await argon2.verify(fromDb!.password!, newPassword)).toBe(true);
      expect(await argon2.verify(fromDb!.password!, oldPassword)).toBe(false);
    });

    it('throws BadRequest when the old password is wrong', async () => {
      const user = await seedUserWithPassword('wrongold@example.com');

      await expect(
        service.updatePassword({
          userId: String(user._id),
          email: 'wrongold@example.com',
          oldPassword: 'not-the-Passw0rd!',
          newPassword,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when the user has no password set', async () => {
      const user = await service.createWithEmail({
        firstName: 'NoPw',
        email: 'nopw@example.com',
      });

      await expect(
        service.updatePassword({
          userId: String(user._id),
          email: 'nopw@example.com',
          oldPassword,
          newPassword,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('hasPassword', () => {
    it('returns false for a user with no password', async () => {
      const user = await service.createWithEmail({
        firstName: 'NoPw',
        email: 'haspw-no@example.com',
      });
      expect(await service.hasPassword(String(user._id))).toBe(false);
    });

    it('returns true once a password is set', async () => {
      const email = 'haspw-yes@example.com';
      const user = await service.createWithEmail({ firstName: 'Pw', email });
      await service.createPassword({
        userId: String(user._id),
        email,
        newPassword: 'sup3r-Secret!pw',
      });
      expect(await service.hasPassword(String(user._id))).toBe(true);
    });

    it('throws NotFound for a missing user', async () => {
      const missing = new Types.ObjectId().toString();
      await expect(service.hasPassword(missing)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setBusinessId', () => {
    it('sets the businessId for a user that has none', async () => {
      const user = await service.createWithEmail({
        firstName: 'Biz',
        email: 'biz@example.com',
      });

      const result = await service.setBusinessId(
        String(user._id),
        'business-123',
      );
      expect(result.businessId).toBe('business-123');

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.businessId).toBe('business-123');
    });

    it('throws NotFound when no user has that id', async () => {
      const missingId = new Types.ObjectId().toString();
      await expect(
        service.setBusinessId(missingId, 'business-123'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Conflict when the user already has a businessId', async () => {
      const user = await service.createWithEmail({
        firstName: 'Biz',
        email: 'hasbiz@example.com',
      });
      await service.setBusinessId(String(user._id), 'business-original');

      await expect(
        service.setBusinessId(String(user._id), 'business-new'),
      ).rejects.toBeInstanceOf(ConflictException);

      // Original value untouched.
      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.businessId).toBe('business-original');
    });
  });

  describe('profile updates', () => {
    async function seedUser(email: string) {
      return service.createWithGoogle({
        firstName: 'Orig',
        lastName: 'Name',
        email,
        googleId: `g-${email}`,
        avatarUrl: 'https://example.com/orig.png',
      });
    }

    it('updateFirstName changes only the first name', async () => {
      const user = await seedUser('fn@example.com');
      await service.updateFirstName(String(user._id), 'NewFirst');

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.firstName).toBe('NewFirst');
      expect(fromDb?.lastName).toBe('Name');
    });

    it('updateLastName changes the last name and can clear it with null', async () => {
      const user = await seedUser('ln@example.com');

      await service.updateLastName(String(user._id), 'NewLast');
      let fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.lastName).toBe('NewLast');

      await service.updateLastName(String(user._id), null);
      fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.lastName == null).toBe(true);
    });

    it('updateAvatar stores url + key and can clear both with null', async () => {
      const user = await seedUser('av@example.com');

      await service.updateAvatar(
        String(user._id),
        'https://example.com/new.png',
        'avatars/abc.png',
      );
      let fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.avatarUrl).toBe('https://example.com/new.png');
      expect(fromDb?.avatarKey).toBe('avatars/abc.png');
      // No previous key on first set -> nothing to delete.
      expect(fileStorage.deleteFile).not.toHaveBeenCalled();

      await service.updateAvatar(String(user._id), null, null);
      fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.avatarUrl == null).toBe(true);
      expect(fromDb?.avatarKey == null).toBe(true);
    });

    it('updateAvatar deletes the previous object when the key changes', async () => {
      const user = await seedUser('swap@example.com');
      await service.updateAvatar(
        String(user._id),
        'https://example.com/old.png',
        'avatars/old.png',
      );
      fileStorage.deleteFile.mockClear();

      await service.updateAvatar(
        String(user._id),
        'https://example.com/new.png',
        'avatars/new.png',
      );

      expect(fileStorage.deleteFile).toHaveBeenCalledWith('avatars/old.png');
    });

    it('updateAvatar does not delete when the key is unchanged', async () => {
      const user = await seedUser('same@example.com');
      await service.updateAvatar(
        String(user._id),
        'https://example.com/a.png',
        'avatars/same.png',
      );
      fileStorage.deleteFile.mockClear();

      await service.updateAvatar(
        String(user._id),
        'https://example.com/a.png',
        'avatars/same.png',
      );

      expect(fileStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('updateProfile updates all provided fields at once', async () => {
      const user = await seedUser('bulk@example.com');

      await service.updateProfile(String(user._id), {
        firstName: 'BulkFirst',
        lastName: 'BulkLast',
        avatarUrl: 'https://example.com/bulk.png',
      });

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.firstName).toBe('BulkFirst');
      expect(fromDb?.lastName).toBe('BulkLast');
      expect(fromDb?.avatarUrl).toBe('https://example.com/bulk.png');
    });

    it('updateProfile only touches fields that are present', async () => {
      const user = await seedUser('partial@example.com');

      await service.updateProfile(String(user._id), { firstName: 'OnlyFirst' });

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.firstName).toBe('OnlyFirst');
      // Untouched.
      expect(fromDb?.lastName).toBe('Name');
      expect(fromDb?.avatarUrl).toBe('https://example.com/orig.png');
    });

    it('throws NotFound when the user does not exist', async () => {
      const missingId = new Types.ObjectId().toString();
      await expect(
        service.updateFirstName(missingId, 'X'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateProfile(missingId, { firstName: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    let emitSpy: jest.SpyInstance;

    beforeEach(() => {
      emitSpy = jest.spyOn(eventEmitter, 'emit');
    });

    afterEach(() => {
      emitSpy.mockRestore();
    });

    it('marks the account deleted, sets deletedAt, and emits user.deleted', async () => {
      const user = await service.createWithEmail({
        firstName: 'Del',
        email: 'del@example.com',
      });

      const result = await service.deleteAccount(String(user._id));
      expect(result.deleted).toBe(true);
      expect(result.deletedAt).toBeInstanceOf(Date);

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.deleted).toBe(true);
      expect(fromDb?.deletedAt).toBeInstanceOf(Date);

      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.DELETED,
        expect.objectContaining({ userId: String(user._id) }),
      );
    });

    it('deleting an already-deleted account is a no-op and emits nothing', async () => {
      const user = await service.createWithEmail({
        firstName: 'Del',
        email: 'noop-del@example.com',
      });
      await service.deleteAccount(String(user._id));
      emitSpy.mockClear();

      await service.deleteAccount(String(user._id));
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('throws NotFound when the user does not exist', async () => {
      const missingId = new Types.ObjectId().toString();
      await expect(service.deleteAccount(missingId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reactivateIfWithinWindow', () => {
    let emitSpy: jest.SpyInstance;

    beforeEach(() => {
      emitSpy = jest.spyOn(eventEmitter, 'emit');
    });

    afterEach(() => {
      emitSpy.mockRestore();
    });

    it('is a no-op for a non-deleted user and emits nothing', async () => {
      const user = await service.createWithEmail({
        firstName: 'Active',
        email: 'react-active@example.com',
      });

      const result = await service.reactivateIfWithinWindow(String(user._id));
      expect(result.reactivated).toBe(false);
      expect(emitSpy).not.toHaveBeenCalled();

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.deleted).toBe(false);
    });

    it('reactivates a user deleted 10 days ago and emits user.restored', async () => {
      const user = await service.createWithEmail({
        firstName: 'Recent',
        email: 'react-recent@example.com',
      });
      await service.deleteAccount(String(user._id));

      // Set deletedAt to 10 days ago via the model.
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await userModel
        .updateOne({ _id: user._id }, { deletedAt: tenDaysAgo })
        .exec();

      emitSpy.mockClear();
      const result = await service.reactivateIfWithinWindow(String(user._id));
      expect(result.reactivated).toBe(true);

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.deleted).toBe(false);
      expect(fromDb?.deletedAt == null).toBe(true);

      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.RESTORED,
        expect.objectContaining({ userId: String(user._id) }),
      );
    });

    it('throws Forbidden for a user deleted 100 days ago', async () => {
      const user = await service.createWithEmail({
        firstName: 'Stale',
        email: 'react-stale@example.com',
      });
      await service.deleteAccount(String(user._id));

      const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      await userModel
        .updateOne({ _id: user._id }, { deletedAt: hundredDaysAgo })
        .exec();

      await expect(
        service.reactivateIfWithinWindow(String(user._id)),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Still deleted; no restore happened.
      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.deleted).toBe(true);
    });
  });

  describe('email change (OTP)', () => {
    it('requestEmailChange stores a code and emails the NEW address', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'old@example.com',
      });

      const result = await service.requestEmailChange(
        String(user._id),
        'New@Example.com',
      );
      expect(result.message).toBeDefined();

      const pending = await emailChangeModel
        .findOne({ userId: String(user._id) })
        .exec();
      expect(pending).not.toBeNull();
      expect(pending?.newEmail).toBe('new@example.com'); // normalized
      expect(pending?.code).toMatch(/^\d{6}$/);

      // Code was emailed to the NEW (normalized) address.
      expect(mail.sendVerificationCode).toHaveBeenCalledWith(
        'new@example.com',
        pending?.code,
        expect.any(Number),
      );
    });

    it('requestEmailChange replaces a prior pending change', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'old2@example.com',
      });

      await service.requestEmailChange(String(user._id), 'first@example.com');
      await service.requestEmailChange(String(user._id), 'second@example.com');

      const pendings = await emailChangeModel
        .find({ userId: String(user._id) })
        .exec();
      expect(pendings).toHaveLength(1);
      expect(pendings[0].newEmail).toBe('second@example.com');
    });

    it('requestEmailChange throws Conflict when the new email belongs to another user', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'me@example.com',
      });
      await service.createWithEmail({
        firstName: 'Other',
        email: 'taken@example.com',
      });

      await expect(
        service.requestEmailChange(String(user._id), 'taken@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('requestEmailChange throws BadRequest when the new email equals the current one', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'same@example.com',
      });

      await expect(
        service.requestEmailChange(String(user._id), 'Same@Example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mail.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('confirmEmailChange swaps the email and clears the pending record', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'before@example.com',
      });
      await service.requestEmailChange(String(user._id), 'after@example.com');

      const pending = await emailChangeModel
        .findOne({ userId: String(user._id) })
        .exec();
      const code = pending!.code;

      const updated = await service.confirmEmailChange(String(user._id), code);
      expect(updated.email).toBe('after@example.com');

      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.email).toBe('after@example.com');

      const remaining = await emailChangeModel
        .countDocuments({ userId: String(user._id) })
        .exec();
      expect(remaining).toBe(0);
    });

    it('confirmEmailChange throws BadRequest for a wrong code', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'wrongcode@example.com',
      });
      await service.requestEmailChange(String(user._id), 'next@example.com');

      await expect(
        service.confirmEmailChange(String(user._id), '000000'),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Email unchanged.
      const fromDb = await userModel.findById(user._id).exec();
      expect(fromDb?.email).toBe('wrongcode@example.com');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserServiceV2 } from './user.service';
import { USER_DATA_SOURCE } from '../domain/user.repository';
import { EMAIL_CHANGE_DATA_SOURCE } from '../domain/email-change.repository';
import { FileStorageService } from '../../file-storage/file-storage.service';
import { MailService } from '../../mail/mail.service';
import { UserEvents } from '../events/user.events';
import { LinkFieldAction } from '../dto/link-google-account.dto';
import { mockFileStorageProvider } from '../../test-utils/file-storage.mock';
import {
  FakeEmailChangeRepository,
  FakeUserRepository,
} from '../../test-utils/fake-user';

/**
 * Behavioural mirror of the legacy user service spec, run against
 * `UserServiceV2`. The service is exercised through in-memory fakes of its
 * repository ports (the whole point of the repository pattern) so the same
 * scenarios verify the ported logic without a database. The real
 * `PostgresUserRepository` SQL path is covered by the live Postgres smoke test.
 */
describe('UserServiceV2 (behavioural, fake repositories)', () => {
  let moduleRef: TestingModule;
  let service: UserServiceV2;
  let users: FakeUserRepository;
  let emailChanges: FakeEmailChangeRepository;
  let eventEmitter: EventEmitter2;
  let fileStorage: { deleteFile: jest.Mock };
  let mail: { sendVerificationCode: jest.Mock };

  const MISSING = '00000000-0000-4000-8000-999999999999';

  beforeEach(async () => {
    users = new FakeUserRepository();
    emailChanges = new FakeEmailChangeRepository();

    moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        UserServiceV2,
        { provide: USER_DATA_SOURCE, useValue: users },
        { provide: EMAIL_CHANGE_DATA_SOURCE, useValue: emailChanges },
        mockFileStorageProvider,
        {
          provide: MailService,
          useValue: { sendVerificationCode: jest.fn(), sendWelcome: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(UserServiceV2);
    eventEmitter = moduleRef.get(EventEmitter2);
    fileStorage = moduleRef.get(FileStorageService);
    mail = moduleRef.get(MailService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('createWithEmail', () => {
    it('persists a new user and can be read back', async () => {
      const created = await service.createWithEmail({
        firstName: 'Ada',
        email: 'ada@example.com',
      });

      expect(created.id).toBeDefined();
      expect(created.firstName).toBe('Ada');
      expect(created.email).toBe('ada@example.com');
      expect(created.shortId).toHaveLength(8);

      const fromDb = users._get(created.id);
      expect(fromDb).toBeDefined();
      expect(fromDb?.email).toBe('ada@example.com');
      expect(fromDb?.password).toBeNull();
      expect(users._count()).toBe(1);
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

      expect(String(second.id)).toBe(String(first.id));
      expect(second.firstName).toBe('Ada');
      expect(users._count((u) => u.email === 'dupe@example.com')).toBe(1);
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

      const fromDb = users._get(created.id);
      expect(fromDb?.firstName).toBe('Grace');
      expect(fromDb?.lastName).toBe('Hopper');
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

      const fromDb = users._get(created.id);
      expect(fromDb?.googleId).toBe('google-456');
      expect(fromDb?.lastName).toBeNull();
      expect(fromDb?.avatarUrl).toBeNull();
      expect(fromDb?.isEmailVerified).toBe(true);
    });

    it('returns the existing user on duplicate email without linking google', async () => {
      await service.createWithEmail({
        firstName: 'Existing',
        email: 'shared@example.com',
      });
      const viaGoogle = await service.createWithGoogle({
        firstName: 'Google Name',
        email: 'shared@example.com',
        googleId: 'google-789',
      });

      expect(viaGoogle.firstName).toBe('Existing');
      // v2 maps absent columns to null (legacy Mongoose returned undefined).
      expect(viaGoogle.googleId).toBeNull();
      expect(users._count((u) => u.email === 'shared@example.com')).toBe(1);
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
      });

      const fromDb = await users.findByEmail('link@example.com');
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
        },
      });

      const fromDb = await users.findByEmail('prefs@example.com');
      expect(fromDb?.firstName).toBe('KeepMe');
      expect(fromDb?.lastName).toBe('GoogleLast');
      expect(fromDb?.avatarUrl).toBe('https://example.com/g.png');
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

    it('stores a hashed password (argon2) for a user that has none', async () => {
      const user = await service.createWithEmail({
        firstName: 'Pass',
        email: 'setpw@example.com',
      });
      const result = await service.createPassword({
        userId: String(user.id),
        email: 'setpw@example.com',
        newPassword: password,
      });

      // Service returns the domain user for the same id (password masking is the
      // controller's job via toUserResponse).
      expect(result.id).toBe(user.id);

      const fromDb = users._get(user.id);
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
          userId: String(user.id),
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
        userId: String(user.id),
        email: 'already@example.com',
        newPassword: password,
      });

      await expect(
        service.createPassword({
          userId: String(user.id),
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
        userId: String(user.id),
        email,
        newPassword: oldPassword,
      });
      return user;
    }

    it('replaces the password when the old password matches', async () => {
      const user = await seedUserWithPassword('update@example.com');
      await service.updatePassword({
        userId: String(user.id),
        email: 'update@example.com',
        oldPassword,
        newPassword,
      });

      const fromDb = users._get(user.id);
      expect(await argon2.verify(fromDb!.password!, newPassword)).toBe(true);
      expect(await argon2.verify(fromDb!.password!, oldPassword)).toBe(false);
    });

    it('throws BadRequest when the old password is wrong', async () => {
      const user = await seedUserWithPassword('wrongold@example.com');

      await expect(
        service.updatePassword({
          userId: String(user.id),
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
          userId: String(user.id),
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
      expect(await service.hasPassword(String(user.id))).toBe(false);
    });

    it('returns true once a password is set', async () => {
      const email = 'haspw-yes@example.com';
      const user = await service.createWithEmail({ firstName: 'Pw', email });
      await service.createPassword({
        userId: String(user.id),
        email,
        newPassword: 'sup3r-Secret!pw',
      });
      expect(await service.hasPassword(String(user.id))).toBe(true);
    });

    it('throws NotFound for a missing user', async () => {
      await expect(service.hasPassword(MISSING)).rejects.toBeInstanceOf(
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
        String(user.id),
        'business-123',
      );
      expect(result.businessId).toBe('business-123');
      expect(users._get(user.id)?.businessId).toBe('business-123');
    });

    it('throws NotFound when no user has that id', async () => {
      await expect(
        service.setBusinessId(MISSING, 'business-123'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Conflict when the user already has a businessId', async () => {
      const user = await service.createWithEmail({
        firstName: 'Biz',
        email: 'hasbiz@example.com',
      });
      await service.setBusinessId(String(user.id), 'business-original');

      await expect(
        service.setBusinessId(String(user.id), 'business-new'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users._get(user.id)?.businessId).toBe('business-original');
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
      await service.updateFirstName(String(user.id), 'NewFirst');

      const fromDb = users._get(user.id);
      expect(fromDb?.firstName).toBe('NewFirst');
      expect(fromDb?.lastName).toBe('Name');
    });

    it('updateLastName changes the last name and can clear it with null', async () => {
      const user = await seedUser('ln@example.com');

      await service.updateLastName(String(user.id), 'NewLast');
      expect(users._get(user.id)?.lastName).toBe('NewLast');

      await service.updateLastName(String(user.id), null);
      expect(users._get(user.id)?.lastName == null).toBe(true);
    });

    it('updateAvatar stores url + key and can clear both with null', async () => {
      const user = await seedUser('av@example.com');

      await service.updateAvatar(
        String(user.id),
        'https://example.com/new.png',
        'avatars/abc.png',
      );
      expect(users._get(user.id)?.avatarUrl).toBe(
        'https://example.com/new.png',
      );
      expect(users._get(user.id)?.avatarKey).toBe('avatars/abc.png');
      expect(fileStorage.deleteFile).not.toHaveBeenCalled();

      await service.updateAvatar(String(user.id), null, null);
      expect(users._get(user.id)?.avatarUrl == null).toBe(true);
      expect(users._get(user.id)?.avatarKey == null).toBe(true);
    });

    it('updateAvatar deletes the previous object when the key changes', async () => {
      const user = await seedUser('swap@example.com');
      await service.updateAvatar(
        String(user.id),
        'https://example.com/old.png',
        'avatars/old.png',
      );
      fileStorage.deleteFile.mockClear();

      await service.updateAvatar(
        String(user.id),
        'https://example.com/new.png',
        'avatars/new.png',
      );

      expect(fileStorage.deleteFile).toHaveBeenCalledWith('avatars/old.png');
    });

    it('updateAvatar does not delete when the key is unchanged', async () => {
      const user = await seedUser('same@example.com');
      await service.updateAvatar(
        String(user.id),
        'https://example.com/a.png',
        'avatars/same.png',
      );
      fileStorage.deleteFile.mockClear();

      await service.updateAvatar(
        String(user.id),
        'https://example.com/a.png',
        'avatars/same.png',
      );

      expect(fileStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('updateProfile updates all provided fields at once', async () => {
      const user = await seedUser('bulk@example.com');
      await service.updateProfile(String(user.id), {
        firstName: 'BulkFirst',
        lastName: 'BulkLast',
        avatarUrl: 'https://example.com/bulk.png',
      });

      const fromDb = users._get(user.id);
      expect(fromDb?.firstName).toBe('BulkFirst');
      expect(fromDb?.lastName).toBe('BulkLast');
      expect(fromDb?.avatarUrl).toBe('https://example.com/bulk.png');
    });

    it('updateProfile only touches fields that are present', async () => {
      const user = await seedUser('partial@example.com');
      await service.updateProfile(String(user.id), { firstName: 'OnlyFirst' });

      const fromDb = users._get(user.id);
      expect(fromDb?.firstName).toBe('OnlyFirst');
      expect(fromDb?.lastName).toBe('Name');
      expect(fromDb?.avatarUrl).toBe('https://example.com/orig.png');
    });

    it('throws NotFound when the user does not exist', async () => {
      await expect(
        service.updateFirstName(MISSING, 'X'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateProfile(MISSING, { firstName: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    let emitSpy: jest.SpyInstance;
    beforeEach(() => {
      emitSpy = jest.spyOn(eventEmitter, 'emit');
    });
    afterEach(() => emitSpy.mockRestore());

    it('marks the account deleted, sets deletedAt, and emits user.deleted', async () => {
      const user = await service.createWithEmail({
        firstName: 'Del',
        email: 'del@example.com',
      });

      const result = await service.deleteAccount(String(user.id));
      expect(result.deleted).toBe(true);
      expect(result.deletedAt).toBeInstanceOf(Date);

      const fromDb = users._get(user.id);
      expect(fromDb?.deleted).toBe(true);
      expect(fromDb?.deletedAt).toBeInstanceOf(Date);

      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.DELETED,
        expect.objectContaining({ userId: String(user.id) }),
      );
    });

    it('deleting an already-deleted account is a no-op and emits nothing', async () => {
      const user = await service.createWithEmail({
        firstName: 'Del',
        email: 'noop-del@example.com',
      });
      await service.deleteAccount(String(user.id));
      emitSpy.mockClear();

      await service.deleteAccount(String(user.id));
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('throws NotFound when the user does not exist', async () => {
      await expect(service.deleteAccount(MISSING)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reactivateIfWithinWindow', () => {
    let emitSpy: jest.SpyInstance;
    beforeEach(() => {
      emitSpy = jest.spyOn(eventEmitter, 'emit');
    });
    afterEach(() => emitSpy.mockRestore());

    it('is a no-op for a non-deleted user and emits nothing', async () => {
      const user = await service.createWithEmail({
        firstName: 'Active',
        email: 'react-active@example.com',
      });

      const result = await service.reactivateIfWithinWindow(String(user.id));
      expect(result.reactivated).toBe(false);
      expect(emitSpy).not.toHaveBeenCalled();
      expect(users._get(user.id)?.deleted).toBe(false);
    });

    it('reactivates a user deleted 10 days ago and emits user.restored', async () => {
      const user = await service.createWithEmail({
        firstName: 'Recent',
        email: 'react-recent@example.com',
      });
      await service.deleteAccount(String(user.id));
      // Backdate deletedAt via the fake store.
      users._get(user.id)!.deletedAt = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      );

      emitSpy.mockClear();
      const result = await service.reactivateIfWithinWindow(String(user.id));
      expect(result.reactivated).toBe(true);

      const fromDb = users._get(user.id);
      expect(fromDb?.deleted).toBe(false);
      expect(fromDb?.deletedAt == null).toBe(true);

      expect(emitSpy).toHaveBeenCalledWith(
        UserEvents.RESTORED,
        expect.objectContaining({ userId: String(user.id) }),
      );
    });

    it('throws Unauthorized for a user deleted 100 days ago', async () => {
      const user = await service.createWithEmail({
        firstName: 'Stale',
        email: 'react-stale@example.com',
      });
      await service.deleteAccount(String(user.id));
      users._get(user.id)!.deletedAt = new Date(
        Date.now() - 100 * 24 * 60 * 60 * 1000,
      );

      await expect(
        service.reactivateIfWithinWindow(String(user.id)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users._get(user.id)?.deleted).toBe(true);
    });
  });

  describe('email change (OTP)', () => {
    it('requestEmailChange stores a code and emails the NEW address', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'old@example.com',
      });

      const result = await service.requestEmailChange(
        String(user.id),
        'New@Example.com',
      );
      expect(result.message).toBeDefined();

      const pending = emailChanges.rows.find(
        (r) => r.userId === String(user.id),
      );
      expect(pending).toBeDefined();
      expect(pending?.newEmail).toBe('new@example.com');
      expect(pending?.code).toMatch(/^\d{6}$/);

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

      await service.requestEmailChange(String(user.id), 'first@example.com');
      await service.requestEmailChange(String(user.id), 'second@example.com');

      const pendings = emailChanges.rows.filter(
        (r) => r.userId === String(user.id),
      );
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
        service.requestEmailChange(String(user.id), 'taken@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('requestEmailChange throws BadRequest when the new email equals the current one', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'same@example.com',
      });

      await expect(
        service.requestEmailChange(String(user.id), 'Same@Example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mail.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('confirmEmailChange swaps the email and clears the pending record', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'before@example.com',
      });
      await service.requestEmailChange(String(user.id), 'after@example.com');
      const code = emailChanges.rows.find(
        (r) => r.userId === String(user.id),
      )!.code;

      const updated = await service.confirmEmailChange(String(user.id), code);
      expect(updated.email).toBe('after@example.com');
      expect(users._get(user.id)?.email).toBe('after@example.com');
      expect(
        emailChanges.rows.filter((r) => r.userId === String(user.id)),
      ).toHaveLength(0);
    });

    it('confirmEmailChange throws BadRequest for a wrong code', async () => {
      const user = await service.createWithEmail({
        firstName: 'Em',
        email: 'wrongcode@example.com',
      });
      await service.requestEmailChange(String(user.id), 'next@example.com');

      await expect(
        service.confirmEmailChange(String(user.id), '000000'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users._get(user.id)?.email).toBe('wrongcode@example.com');
    });
  });
});

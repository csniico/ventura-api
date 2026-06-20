import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';

import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { User, UserDocument, UserSchema } from '../user/schemas/user.schema';
import {
  EmailChange,
  EmailChangeSchema,
} from '../user/schemas/email-change.schema';
import { MailService } from '../mail/mail.service';
import {
  VerificationCode,
  VerificationCodeDocument,
  VerificationCodeSchema,
} from './schemas/verification-code.schema';
import { resolveTestUri } from '../test-utils/test-db';
import { mockFileStorageProvider } from '../test-utils/file-storage.mock';

describe('AuthService (integration)', () => {
  let moduleRef: TestingModule;
  let auth: AuthService;
  let users: UserService;
  let jwt: JwtService;
  let userModel: Model<UserDocument>;
  let codeModel: Model<VerificationCodeDocument>;
  let connection: Connection;

  // Mocked mail so tests never send real emails.
  const mailService = {
    sendVerificationCode: jest.fn(),
    sendWelcome: jest.fn(),
  };

  beforeAll(async () => {
    // Ensure JWT secrets exist for the test run.
    process.env.JWT_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

    const uri = resolveTestUri('auth');

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        JwtModule.register({}),
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: VerificationCode.name, schema: VerificationCodeSchema },
          { name: EmailChange.name, schema: EmailChangeSchema },
        ]),
      ],
      providers: [
        AuthService,
        UserService,
        { provide: MailService, useValue: mailService },
        mockFileStorageProvider,
      ],
    }).compile();

    auth = moduleRef.get(AuthService);
    users = moduleRef.get(UserService);
    jwt = moduleRef.get(JwtService);
    userModel = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));
    codeModel = moduleRef.get<Model<VerificationCodeDocument>>(
      getModelToken(VerificationCode.name),
    );
    connection = moduleRef.get<Connection>(getConnectionToken());
  });

  beforeEach(async () => {
    await userModel.deleteMany({});
    await codeModel.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await userModel.deleteMany({});
    await codeModel.deleteMany({});
    await connection.close();
    await moduleRef.close();
  });

  const password = 'Sup3r-Secret!pw';

  async function seedUserWithPassword(email: string): Promise<UserDocument> {
    const user = await users.createWithEmail({ firstName: 'Ada', email });
    await users.createPassword({
      userId: String(user._id),
      email,
      newPassword: password,
    });
    return user;
  }

  it('returns tokens and the user (no secrets) on valid credentials', async () => {
    const user = await seedUserWithPassword('login@example.com');

    const result = await auth.signInWithPassword('login@example.com', password);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe('login@example.com');
    // Secrets must not leak.
    expect(result.user.password).toBeUndefined();
    expect(result.user.hashedRefreshToken).toBeUndefined();

    // Access token carries the userId as sub.
    const decoded = jwt.verify<{ sub: string }>(result.accessToken, {
      secret: process.env.JWT_SECRET,
    });
    expect(decoded.sub).toBe(String(user._id));

    // A hashed refresh token was stored.
    const stored = await users.getHashedRefreshToken(String(user._id));
    expect(stored).toBeTruthy();
  });

  it('reactivates a recently-deleted user on password sign-in', async () => {
    const user = await seedUserWithPassword('comeback@example.com');
    await users.deleteAccount(String(user._id));

    // Confirm it is actually soft-deleted (deletedAt recent from deleteAccount).
    let fromDb = await userModel.findById(user._id).exec();
    expect(fromDb?.deleted).toBe(true);

    const result = await auth.signInWithPassword(
      'comeback@example.com',
      password,
    );
    expect(result.accessToken).toBeTruthy();
    expect(result.user.deleted).toBe(false);

    fromDb = await userModel.findById(user._id).exec();
    expect(fromDb?.deleted).toBe(false);
    expect(fromDb?.deletedAt == null).toBe(true);
  });

  it('rejects a wrong password with 401', async () => {
    await seedUserWithPassword('wrong@example.com');
    await expect(
      auth.signInWithPassword('wrong@example.com', 'not-the-Passw0rd!'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email with 401', async () => {
    await expect(
      auth.signInWithPassword('nobody@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user has no password set with 401', async () => {
    await users.createWithEmail({
      firstName: 'NoPw',
      email: 'nopw@example.com',
    });
    await expect(
      auth.signInWithPassword('nopw@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('email code flow', () => {
    it('creates the user, stores a 6-digit code, and emails it', async () => {
      const email = 'newby@example.com';
      const res = await auth.requestEmailCode(email);
      expect(res.message).toBeTruthy();

      // User was auto-created (passwordless = sign-up).
      const user = await userModel.findOne({ email }).exec();
      expect(user).not.toBeNull();

      // A code was stored, 6 numeric digits.
      const record = await codeModel.findOne({ email }).exec();
      expect(record).not.toBeNull();
      expect(record!.code).toMatch(/^\d{6}$/);

      // It was emailed with the same code.
      expect(mailService.sendVerificationCode).toHaveBeenCalledWith(
        email,
        record!.code,
        expect.any(Number),
      );
    });

    it('replaces any previous code on a new request', async () => {
      const email = 'replace@example.com';
      await auth.requestEmailCode(email);
      await auth.requestEmailCode(email);

      const count = await codeModel.countDocuments({ email });
      expect(count).toBe(1);
    });

    it('verifies a valid code, issues tokens, and sends welcome on first verify', async () => {
      const email = 'verify@example.com';
      await auth.requestEmailCode(email);
      const record = await codeModel.findOne({ email }).exec();

      const result = await auth.verifyEmailCode(email, record!.code);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe(email);

      // Email marked verified.
      const user = await userModel.findOne({ email }).exec();
      expect(user!.isEmailVerified).toBe(true);

      // Code consumed.
      const remaining = await codeModel.countDocuments({ email });
      expect(remaining).toBe(0);

      // Welcome sent on first verification.
      expect(mailService.sendWelcome).toHaveBeenCalledWith(
        email,
        user!.firstName,
      );
    });

    it('does not resend welcome on a subsequent verification', async () => {
      const email = 'second@example.com';
      await auth.requestEmailCode(email);
      let record = await codeModel.findOne({ email }).exec();
      await auth.verifyEmailCode(email, record!.code);

      mailService.sendWelcome.mockClear();

      await auth.requestEmailCode(email);
      record = await codeModel.findOne({ email }).exec();
      await auth.verifyEmailCode(email, record!.code);

      expect(mailService.sendWelcome).not.toHaveBeenCalled();
    });

    it('rejects a wrong code with 400', async () => {
      const email = 'wrongcode@example.com';
      await auth.requestEmailCode(email);
      await expect(
        auth.verifyEmailCode(email, '000000'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an expired code with 400', async () => {
      const email = 'expired@example.com';
      await auth.requestEmailCode(email);
      // Force the code to be expired.
      await codeModel
        .updateOne({ email }, { expiresAt: new Date(Date.now() - 1000) })
        .exec();
      const record = await codeModel.findOne({ email }).exec();

      await expect(
        auth.verifyEmailCode(email, record!.code),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('google sign-in', () => {
    // Stub the OAuth2Client's verifyIdToken on the service instance.
    function mockGooglePayload(payload: Record<string, unknown> | undefined) {
      const client = (auth as unknown as { googleClient: unknown })
        .googleClient as { verifyIdToken: jest.Mock };
      jest
        .spyOn(client, 'verifyIdToken')
        .mockResolvedValue({ getPayload: () => payload });
    }

    it('creates a user from the Google payload and issues tokens', async () => {
      mockGooglePayload({
        email: 'guser@example.com',
        sub: 'google-sub-1',
        given_name: 'Grace',
        family_name: 'Hopper',
        picture: 'https://example.com/g.png',
      });

      const result = await auth.signInWithGoogle('fake-id-token');

      expect(result.accessToken).toBeTruthy();
      expect(result.user.email).toBe('guser@example.com');

      const user = await userModel
        .findOne({ email: 'guser@example.com' })
        .exec();
      expect(user!.googleId).toBe('google-sub-1');
      expect(user!.firstName).toBe('Grace');
      expect(user!.lastName).toBe('Hopper');
      expect(user!.isEmailVerified).toBe(true);
      // Welcome on first (new) sign-in.
      expect(mailService.sendWelcome).toHaveBeenCalledWith(
        'guser@example.com',
        'Grace',
      );
    });

    it('signs in an existing user without resending welcome', async () => {
      await userModel.create({
        firstName: 'Existing',
        email: 'exists@example.com',
      });
      mockGooglePayload({ email: 'exists@example.com', sub: 'google-sub-2' });

      const result = await auth.signInWithGoogle('fake-id-token');

      expect(result.user.email).toBe('exists@example.com');
      expect(mailService.sendWelcome).not.toHaveBeenCalled();
    });

    it('rejects an invalid Google token with 401', async () => {
      const client = (auth as unknown as { googleClient: unknown })
        .googleClient as { verifyIdToken: jest.Mock };
      jest
        .spyOn(client, 'verifyIdToken')
        .mockRejectedValue(new Error('bad token'));

      await expect(auth.signInWithGoogle('bad-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token whose payload lacks email/sub with 401', async () => {
      mockGooglePayload({ sub: 'google-sub-3' }); // no email

      await expect(
        auth.signInWithGoogle('fake-id-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh + logout', () => {
    it('verifyRefreshToken matches the stored hash and rejects others', async () => {
      const user = await seedUserWithPassword('refresh@example.com');
      const { refreshToken } = await auth.signInWithPassword(
        'refresh@example.com',
        password,
      );

      const id = String(user._id);
      expect(await auth.verifyRefreshToken(id, refreshToken)).toBe(true);
      expect(await auth.verifyRefreshToken(id, 'some-other-token')).toBe(false);
    });

    it('refreshTokens issues a new pair and rotates the stored hash', async () => {
      const user = await seedUserWithPassword('rotate@example.com');
      const id = String(user._id);
      const first = await auth.signInWithPassword(
        'rotate@example.com',
        password,
      );

      const rotated = await auth.refreshTokens(id);
      expect(rotated.accessToken).toBeTruthy();
      expect(rotated.refreshToken).toBeTruthy();

      // New refresh token validates; the old one no longer matches the hash.
      expect(await auth.verifyRefreshToken(id, rotated.refreshToken)).toBe(
        true,
      );
      expect(await auth.verifyRefreshToken(id, first.refreshToken)).toBe(false);
    });

    it('logout clears the stored refresh token so it can no longer be used', async () => {
      const user = await seedUserWithPassword('logout@example.com');
      const id = String(user._id);
      const { refreshToken } = await auth.signInWithPassword(
        'logout@example.com',
        password,
      );

      await auth.logout(id);

      expect(await users.getHashedRefreshToken(id)).toBeNull();
      expect(await auth.verifyRefreshToken(id, refreshToken)).toBe(false);
    });

    it('verifyRefreshToken returns false when no token is stored', async () => {
      const user = await users.createWithEmail({
        firstName: 'NoTok',
        email: 'notok@example.com',
      });
      expect(await auth.verifyRefreshToken(String(user._id), 'anything')).toBe(
        false,
      );
    });
  });
});

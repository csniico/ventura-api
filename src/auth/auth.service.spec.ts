import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { MailService } from '../mail/mail.service'
import {
  FakeUserRepository,
  fakeUserServiceProviders,
} from '../test-utils/fake-user'
import {
  FakeVerificationCodeRepository,
  fakeVerificationCodeRepositoryProvider,
} from '../test-utils/fake-verification-code'
import { mockFileStorageProvider } from '../test-utils/file-storage.mock'
import { UserServiceV2 } from '../user/application/user.service'
import { IUser } from '../user/domain/user.entity'
import { AuthService } from './auth.service'

describe('AuthService', () => {
  let moduleRef: TestingModule
  let auth: AuthService
  let users: UserServiceV2
  let usersFake: FakeUserRepository
  let jwt: JwtService
  let codesFake: FakeVerificationCodeRepository

  // Mocked mail so tests never send real emails.
  const mailService = {
    sendVerificationCode: jest.fn(),
    sendWelcome: jest.fn(),
  }

  beforeAll(async () => {
    // Ensure JWT secrets exist for the test run.
    process.env.JWT_SECRET ??= 'test-access-secret'
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret'

    // Users and verification codes both go through Postgres in prod; here
    // they're backed by in-memory fakes.
    const fakeUsers = fakeUserServiceProviders()
    usersFake = fakeUsers.users
    const fakeCodes = fakeVerificationCodeRepositoryProvider()
    codesFake = fakeCodes.codes

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        JwtModule.register({}),
      ],
      providers: [
        AuthService,
        ...fakeUsers.providers,
        fakeCodes.provider,
        { provide: MailService, useValue: mailService },
        mockFileStorageProvider,
      ],
    }).compile()

    auth = moduleRef.get(AuthService)
    users = moduleRef.get(UserServiceV2)
    jwt = moduleRef.get(JwtService)
  })

  beforeEach(() => {
    usersFake._clear()
    codesFake._clear()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  // Find the (single) active code stored for an email.
  const codeFor = (email: string) =>
    codesFake._all().find((r) => r.email === email)
  const codeCount = (email: string) =>
    codesFake._all().filter((r) => r.email === email).length

  const password = 'Sup3r-Secret!pw'

  async function seedUserWithPassword(email: string): Promise<IUser> {
    const user = await users.createWithEmail({ firstName: 'Ada', email })
    await users.createPassword({
      userId: user.id,
      email,
      newPassword: password,
    })
    return user
  }

  it('returns tokens and the user (no secrets) on valid credentials', async () => {
    const user = await seedUserWithPassword('login@example.com')

    const result = await auth.signInWithPassword('login@example.com', password)

    expect(result.accessToken).toBeTruthy()
    expect(result.refreshToken).toBeTruthy()
    expect(result.user.email).toBe('login@example.com')
    // Secrets must not leak (UserResponse has no such fields; check at runtime too).
    const rawUser = result.user as unknown as Record<string, unknown>
    expect(rawUser.password).toBeUndefined()
    expect(rawUser.hashedRefreshToken).toBeUndefined()

    // Access token carries the userId as sub.
    const decoded = jwt.verify<{ sub: string }>(result.accessToken, {
      secret: process.env.JWT_SECRET,
    })
    expect(decoded.sub).toBe(user.id)

    // A hashed refresh token was stored.
    const stored = await users.getHashedRefreshToken(user.id)
    expect(stored).toBeTruthy()
  })

  it('reactivates a recently-deleted user on password sign-in', async () => {
    const user = await seedUserWithPassword('comeback@example.com')
    await users.deleteAccount(user.id)

    // Confirm it is actually soft-deleted (deletedAt recent from deleteAccount).
    expect(usersFake._get(user.id)?.deleted).toBe(true)

    const result = await auth.signInWithPassword(
      'comeback@example.com',
      password,
    )
    expect(result.accessToken).toBeTruthy()
    expect(result.user.deleted).toBe(false)

    expect(usersFake._get(user.id)?.deleted).toBe(false)
    expect(usersFake._get(user.id)?.deletedAt == null).toBe(true)
  })

  it('rejects a wrong password with 401', async () => {
    await seedUserWithPassword('wrong@example.com')
    await expect(
      auth.signInWithPassword('wrong@example.com', 'not-the-Passw0rd!'),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects an unknown email with 401', async () => {
    await expect(
      auth.signInWithPassword('nobody@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects when the user has no password set with 401', async () => {
    await users.createWithEmail({
      firstName: 'NoPw',
      email: 'nopw@example.com',
    })
    await expect(
      auth.signInWithPassword('nopw@example.com', password),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  describe('email code flow', () => {
    it('creates the user, stores a 6-digit code, and emails it', async () => {
      const email = 'newby@example.com'
      const res = await auth.requestEmailCode(email)
      expect(res.message).toBeTruthy()

      // User was auto-created (passwordless = sign-up).
      const user = await users.findByEmail(email)
      expect(user).not.toBeNull()

      // A code was stored, 6 numeric digits.
      const record = codeFor(email)
      expect(record).toBeDefined()
      expect(record!.code).toMatch(/^\d{6}$/)

      // It was emailed with the same code.
      expect(mailService.sendVerificationCode).toHaveBeenCalledWith(
        email,
        record!.code,
        expect.any(Number),
      )
    })

    it('replaces any previous code on a new request', async () => {
      const email = 'replace@example.com'
      await auth.requestEmailCode(email)
      await auth.requestEmailCode(email)

      expect(codeCount(email)).toBe(1)
    })

    it('verifies a valid code, issues tokens, and sends welcome on first verify', async () => {
      const email = 'verify@example.com'
      await auth.requestEmailCode(email)
      const record = codeFor(email)

      const result = await auth.verifyEmailCode(email, record!.code)

      expect(result.accessToken).toBeTruthy()
      expect(result.refreshToken).toBeTruthy()
      expect(result.user.email).toBe(email)

      // Email marked verified.
      const user = await users.findByEmail(email)
      expect(user!.isEmailVerified).toBe(true)

      // Code consumed.
      expect(codeCount(email)).toBe(0)

      // Welcome sent on first verification.
      expect(mailService.sendWelcome).toHaveBeenCalledWith(
        email,
        user!.firstName,
      )
    })

    it('does not resend welcome on a subsequent verification', async () => {
      const email = 'second@example.com'
      await auth.requestEmailCode(email)
      await auth.verifyEmailCode(email, codeFor(email)!.code)

      mailService.sendWelcome.mockClear()

      await auth.requestEmailCode(email)
      await auth.verifyEmailCode(email, codeFor(email)!.code)

      expect(mailService.sendWelcome).not.toHaveBeenCalled()
    })

    it('rejects a wrong code with 400', async () => {
      const email = 'wrongcode@example.com'
      await auth.requestEmailCode(email)
      await expect(
        auth.verifyEmailCode(email, '000000'),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects an expired code with 400', async () => {
      const email = 'expired@example.com'
      await auth.requestEmailCode(email)
      const record = codeFor(email)
      // Force the code to be expired.
      codesFake._forceExpire(email)

      await expect(
        auth.verifyEmailCode(email, record!.code),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('google sign-in', () => {
    // Stub the OAuth2Client's verifyIdToken on the service instance.
    function mockGooglePayload(payload: Record<string, unknown> | undefined) {
      const client = (auth as unknown as { googleClient: unknown })
        .googleClient as { verifyIdToken: jest.Mock }
      jest
        .spyOn(client, 'verifyIdToken')
        .mockResolvedValue({ getPayload: () => payload })
    }

    it('creates a user from the Google payload and issues tokens', async () => {
      mockGooglePayload({
        email: 'guser@example.com',
        sub: 'google-sub-1',
        given_name: 'Grace',
        family_name: 'Hopper',
        picture: 'https://example.com/g.png',
      })

      const result = await auth.signInWithGoogle('fake-id-token')

      expect(result.accessToken).toBeTruthy()
      expect(result.user.email).toBe('guser@example.com')

      const user = await users.findByEmail('guser@example.com')
      expect(user!.googleId).toBe('google-sub-1')
      expect(user!.firstName).toBe('Grace')
      expect(user!.lastName).toBe('Hopper')
      expect(user!.isEmailVerified).toBe(true)
      // Welcome on first (new) sign-in.
      expect(mailService.sendWelcome).toHaveBeenCalledWith(
        'guser@example.com',
        'Grace',
      )
    })

    it('signs in an existing user without resending welcome', async () => {
      await users.createWithEmail({
        firstName: 'Existing',
        email: 'exists@example.com',
      })
      mockGooglePayload({ email: 'exists@example.com', sub: 'google-sub-2' })

      const result = await auth.signInWithGoogle('fake-id-token')

      expect(result.user.email).toBe('exists@example.com')
      expect(mailService.sendWelcome).not.toHaveBeenCalled()
    })

    it('rejects an invalid Google token with 401', async () => {
      const client = (auth as unknown as { googleClient: unknown })
        .googleClient as { verifyIdToken: jest.Mock }
      jest
        .spyOn(client, 'verifyIdToken')
        .mockRejectedValue(new Error('bad token'))

      await expect(auth.signInWithGoogle('bad-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      )
    })

    it('rejects a token whose payload lacks email/sub with 401', async () => {
      mockGooglePayload({ sub: 'google-sub-3' }) // no email

      await expect(
        auth.signInWithGoogle('fake-id-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })
  })

  describe('refresh + logout', () => {
    it('verifyRefreshToken matches the stored hash and rejects others', async () => {
      const user = await seedUserWithPassword('refresh@example.com')
      const { refreshToken } = await auth.signInWithPassword(
        'refresh@example.com',
        password,
      )

      const id = user.id
      expect(await auth.verifyRefreshToken(id, refreshToken)).toBe(true)
      expect(await auth.verifyRefreshToken(id, 'some-other-token')).toBe(false)
    })

    it('refreshTokens issues a new pair and rotates the stored hash', async () => {
      const user = await seedUserWithPassword('rotate@example.com')
      const id = user.id
      const first = await auth.signInWithPassword(
        'rotate@example.com',
        password,
      )

      const rotated = await auth.refreshTokens(id)
      expect(rotated.accessToken).toBeTruthy()
      expect(rotated.refreshToken).toBeTruthy()

      // New refresh token validates; the old one no longer matches the hash.
      expect(await auth.verifyRefreshToken(id, rotated.refreshToken)).toBe(true)
      expect(await auth.verifyRefreshToken(id, first.refreshToken)).toBe(false)
    })

    it('logout clears the stored refresh token so it can no longer be used', async () => {
      const user = await seedUserWithPassword('logout@example.com')
      const id = user.id
      const { refreshToken } = await auth.signInWithPassword(
        'logout@example.com',
        password,
      )

      await auth.logout(id)

      expect(await users.getHashedRefreshToken(id)).toBeNull()
      expect(await auth.verifyRefreshToken(id, refreshToken)).toBe(false)
    })

    it('verifyRefreshToken returns false when no token is stored', async () => {
      const user = await users.createWithEmail({
        firstName: 'NoTok',
        email: 'notok@example.com',
      })
      expect(await auth.verifyRefreshToken(user.id, 'anything')).toBe(false)
    })
  })
})

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { UserService } from '../user/user.service';
import { UserDocument } from '../user/schemas/user.schema';
import { MailService } from '../mail/mail.service';
import {
  VerificationCode,
  VerificationCodeDocument,
} from './schemas/verification-code.schema';
import { AuthResult, AuthTokens, JwtPayload } from './types/auth.types';

const CODE_TTL_MINUTES = 10;

// The `ms`-style duration string @nestjs/jwt expects for expiresIn.
type ExpiresIn =
  | number
  | `${number}`
  | `${number}${'d' | 'h' | 'm' | 's' | 'ms' | 'y' | 'w'}`;

@Injectable()
export class AuthService {
  private readonly googleClientId: string;
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    @InjectModel(VerificationCode.name)
    private readonly codeModel: Model<VerificationCodeDocument>,
  ) {
    this.googleClientId = this.configService.get<string>(
      'GOOGLE_CLIENT_ID',
      '',
    );
    this.googleClient = new OAuth2Client(this.googleClientId);
  }

  /**
   * Issue an access + refresh token pair for a user and persist the
   * argon2-hashed refresh token so it can be verified and revoked later.
   */
  async issueTokens(userId: string): Promise<AuthTokens> {
    const payload = { sub: userId } satisfies JwtPayload;

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<ExpiresIn>('JWT_EXPIRES_IN', '15m'),
    });

    // A unique jti makes every refresh token distinct, so rotation truly
    // invalidates the previous one (two issued in the same second still differ).
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<ExpiresIn>(
          'JWT_REFRESH_EXPIRES_IN',
          '7d',
        ),
      },
    );

    const hashedRefreshToken = await argon2.hash(refreshToken);
    await this.userService.setRefreshToken(userId, hashedRefreshToken);

    return { accessToken, refreshToken };
  }

  /** Build the standard auth response: tokens + the user (password stripped). */
  private async buildAuthResult(user: UserDocument): Promise<AuthResult> {
    const tokens = await this.issueTokens(String(user._id));
    const safeUser = user.toObject() as unknown as Record<string, unknown>;
    delete safeUser.password;
    delete safeUser.hashedRefreshToken;
    return { ...tokens, user: safeUser };
  }

  /**
   * Sign in with email + password. Requires an existing user that has a
   * password set. Throws 401 on any credential failure (no enumeration).
   */
  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const user = await this.userService.verifyCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    // A returning deleted user within the 90-day window is reactivated before
    // tokens are issued; past the window this throws Forbidden and sign-in fails.
    const { reactivated } = await this.userService.reactivateIfWithinWindow(
      String(user._id),
    );
    if (reactivated) {
      user.deleted = false;
      user.deletedAt = null;
    }
    return this.buildAuthResult(user);
  }

  /** Generate a 6-digit numeric code (zero-padded). */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Passwordless email sign-in (also sign-up). Finds or creates the user,
   * generates a fresh 6-digit code (replacing any previous one for the email),
   * stores it with a TTL, and emails it. Responds neutrally either way.
   */
  async requestEmailCode(email: string): Promise<{ message: string }> {
    // Ensure the account exists (passwordless sign-in doubles as sign-up).
    await this.userService.findOrCreateByEmail(email);

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    // One active code per email: replace any existing one.
    await this.codeModel.deleteMany({ email }).exec();
    await this.codeModel.create({ email, code, expiresAt });

    await this.mailService.sendVerificationCode(email, code, CODE_TTL_MINUTES);

    return { message: 'If the email is valid, a verification code was sent.' };
  }

  /**
   * Verify an emailed code and sign the user in. Issues tokens, marks the email
   * verified, sends a welcome email on first verification, and consumes the code.
   * Throws 400 if the code is missing, expired, or wrong.
   */
  async verifyEmailCode(email: string, code: string): Promise<AuthResult> {
    const record = await this.codeModel.findOne({ email, code }).exec();

    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired code.');
    }

    const user = await this.userService.findByEmail(email);
    if (!user) {
      // Shouldn't happen (requestEmailCode creates the user), but guard anyway.
      throw new BadRequestException('Invalid or expired code.');
    }

    // Reactivate a returning deleted user within the window before issuing
    // tokens; past the window this throws Forbidden and sign-in fails.
    const { reactivated } = await this.userService.reactivateIfWithinWindow(
      String(user._id),
    );
    if (reactivated) {
      user.deleted = false;
      user.deletedAt = null;
    }

    const firstVerification = !user.isEmailVerified;
    await this.userService.markEmailVerified(String(user._id));
    user.isEmailVerified = true;

    // Code is single-use.
    await this.codeModel.deleteMany({ email }).exec();

    if (firstVerification) {
      await this.mailService.sendWelcome(email, user.firstName);
    }

    return this.buildAuthResult(user);
  }

  /**
   * Sign in with a Google ID token. Verifies the token's signature and audience
   * against GOOGLE_CLIENT_ID, then finds-or-creates the user from the payload
   * and issues tokens. Throws 401 if the token is invalid.
   */
  async signInWithGoogle(idToken: string): Promise<AuthResult> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token.');
    }

    if (!payload?.email || !payload.sub) {
      throw new UnauthorizedException('Invalid Google token.');
    }

    const isNew = !(await this.userService.findByEmail(payload.email));

    // createWithGoogle returns the existing user on a duplicate email, so this
    // is safe for both sign-up and sign-in.
    const user = await this.userService.createWithGoogle({
      email: payload.email,
      googleId: payload.sub,
      firstName:
        payload.given_name ?? payload.name ?? payload.email.split('@')[0],
      lastName: payload.family_name,
      avatarUrl: payload.picture,
    });

    // Reactivate a returning deleted user (matched by email) within the window
    // before issuing tokens; past the window this throws Forbidden.
    const { reactivated } = await this.userService.reactivateIfWithinWindow(
      String(user._id),
    );
    if (reactivated) {
      user.deleted = false;
      user.deletedAt = null;
    }

    if (isNew) {
      await this.mailService.sendWelcome(payload.email, user.firstName);
    }

    return this.buildAuthResult(user);
  }

  /**
   * Verify a presented refresh token against the user's stored hash.
   * Returns true only if a hash is stored and matches. Used by the refresh
   * strategy after the JWT signature/expiry have already been validated.
   */
  async verifyRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const hashed = await this.userService.getHashedRefreshToken(userId);
    if (!hashed) {
      return false;
    }
    return argon2.verify(hashed, refreshToken).catch(() => false);
  }

  /**
   * Rotate tokens: issue a fresh access + refresh pair (this also replaces the
   * stored refresh hash). Called after the refresh token is validated.
   */
  async refreshTokens(userId: string): Promise<AuthTokens> {
    return this.issueTokens(userId);
  }

  /** Log out: clear the stored refresh token so it can no longer be used. */
  async logout(userId: string): Promise<void> {
    await this.userService.clearRefreshToken(userId);
  }
}

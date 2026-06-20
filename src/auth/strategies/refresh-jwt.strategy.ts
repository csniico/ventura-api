import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { AuthUser, JwtPayload } from '../types/auth.types';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(
  Strategy,
  'refresh-jwt',
) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET', ''),
      passReqToCallback: true,
    });
  }

  /**
   * Runs after the refresh JWT signature + expiry are validated. Also checks
   * the raw token against the user's stored hash so revoked tokens are rejected.
   */
  async validate(req: Request, payload: JwtPayload): Promise<AuthUser> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (!token) {
      throw new UnauthorizedException('Refresh token missing.');
    }
    const valid = await this.authService.verifyRefreshToken(payload.sub, token);
    if (!valid) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return { userId: payload.sub };
  }
}

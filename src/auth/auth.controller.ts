import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshJwtGuard } from './guards/refresh-jwt.guard';
import { AuthUser } from './types/auth.types';
import {
  SignInEmailDto,
  SignInGoogleDto,
  SignInPasswordDto,
  VerifyCodeDto,
} from './dto/sign-in.dto';
import { AuthResponse, MessageResponse } from './responses/auth.response';

// Request after a guard has attached the authenticated user.
interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Sign in with email + password. Returns access + refresh tokens and the user. */
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, type: AuthResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/sign-in-password')
  async signInWithPassword(@Body() dto: SignInPasswordDto) {
    return this.authService.signInWithPassword(dto.email, dto.password);
  }

  /** Passwordless: request a 6-digit sign-in code by email. */
  @ApiOperation({ summary: 'Request a passwordless sign-in code by email' })
  @ApiResponse({ status: 200, type: MessageResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/sign-in-email')
  async signInWithEmail(@Body() dto: SignInEmailDto) {
    return this.authService.requestEmailCode(dto.email);
  }

  /** Verify the emailed code and sign in. Returns tokens and the user. */
  @ApiOperation({ summary: 'Verify an emailed code and sign in' })
  @ApiResponse({ status: 200, type: AuthResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/verify-code')
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyEmailCode(dto.email, dto.code);
  }

  /** Sign in with a Google ID token. Returns tokens and the user. */
  @ApiOperation({ summary: 'Sign in with a Google ID token' })
  @ApiResponse({ status: 200, type: AuthResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/sign-in-google')
  async signInWithGoogle(@Body() dto: SignInGoogleDto) {
    return this.authService.signInWithGoogle(dto.idToken);
  }

  /** Exchange a valid refresh token (Bearer) for a fresh token pair. */
  @ApiOperation({ summary: 'Exchange a refresh token for a fresh token pair' })
  @ApiResponse({ status: 200, type: AuthResponse })
  @UseGuards(RefreshJwtGuard)
  @HttpCode(HttpStatus.OK)
  @Post('/refresh')
  async refresh(@Req() req: AuthedRequest) {
    return this.authService.refreshTokens(req.user.userId);
  }

  /** Log out: revoke the stored refresh token. Requires a valid access token. */
  @ApiOperation({ summary: 'Log out and revoke the stored refresh token' })
  @ApiResponse({ status: 200, type: MessageResponse })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('/logout')
  async logout(@Req() req: AuthedRequest) {
    await this.authService.logout(req.user.userId);
    return { message: 'Logged out.' };
  }
}

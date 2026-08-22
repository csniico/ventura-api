import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserServiceV2 } from './user.service';
import {
  CreateUserWithEmailDto,
  CreateUserWithGoogleDto,
} from '../dto/create-user.dto';
import { LinkGoogleAccountDto } from '../dto/link-google-account.dto';
import { CreatePasswordDto, UpdatePasswordDto } from '../dto/password.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import {
  SetBusinessIdDto,
  UpdateAvatarDto,
  UpdateFirstNameDto,
  UpdateLastNameDto,
} from '../dto/update-field.dto';
import {
  ConfirmEmailChangeDto,
  RequestEmailChangeDto,
} from '../dto/change-email.dto';
import {
  HasPasswordResponse,
  MessageResponse,
  UserResponse,
} from '../responses/user.response';
import { Throttle } from '@nestjs/throttler';
import { toUserResponse } from './user.mapper';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthUser } from '../../auth/types/auth.types';

interface AuthedRequest {
  user: AuthUser;
}

/**
 * Postgres-backed v2 of the user API. Mirrors every route, request DTO, and
 * response shape of the legacy `UserController` (Mongo).
 *
 * Guarding: the account-creation / sign-in-flow routes (`/email`, `/google`,
 * `/link-google`, `/:id/has-password`) run BEFORE the caller is authenticated
 * and stay public. Every self-service route requires a valid access token AND
 * that the token's user owns the target id — the `:id` path param (or
 * `dto.userId`) is never trusted on its own, closing the IDOR / takeover holes.
 */
@ApiTags('Users')
@Controller('users')
export class UserControllerV2 {
  constructor(private readonly userService: UserServiceV2) {}

  /**
   * Assert the authenticated user is acting on their own account. The `:id`
   * path param / `dto.userId` is attacker-controlled, so it must match the id
   * embedded in the verified access token.
   */
  private assertSelf(req: AuthedRequest, targetId: string): void {
    if (req.user.userId !== targetId) {
      throw new ForbiddenException('You can only act on your own account.');
    }
  }

  // --- Account creation (public — pre-auth) ---

  @ApiOperation({ summary: 'Sign up with email (no password yet)' })
  @ApiResponse({ status: 201, type: UserResponse })
  @Post('/email')
  async createWithEmail(@Body() dto: CreateUserWithEmailDto) {
    return toUserResponse(await this.userService.createWithEmail(dto));
  }

  @ApiOperation({ summary: 'Sign up / continue with Google' })
  @ApiResponse({ status: 201, type: UserResponse })
  @Post('/google')
  async createWithGoogle(@Body() dto: CreateUserWithGoogleDto) {
    return toUserResponse(await this.userService.createWithGoogle(dto));
  }

  // --- Google account linking (public — part of the OAuth sign-in flow) ---

  @ApiOperation({ summary: 'Link a Google account to an existing user' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/link-google')
  async linkGoogleAccount(@Body() dto: LinkGoogleAccountDto) {
    return toUserResponse(await this.userService.linkGoogleAccount(dto));
  }

  // --- Password ---

  @ApiOperation({ summary: 'Set a password for a user that has none' })
  @ApiResponse({ status: 201, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @Post('/password')
  async createPassword(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePasswordDto,
  ) {
    this.assertSelf(req, dto.userId);
    return toUserResponse(await this.userService.createPassword(dto));
  }

  @ApiOperation({ summary: 'Change an existing password' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Put('/password')
  async updatePassword(
    @Req() req: AuthedRequest,
    @Body() dto: UpdatePasswordDto,
  ) {
    this.assertSelf(req, dto.userId);
    return toUserResponse(await this.userService.updatePassword(dto));
  }

  // --- Read ---

  @ApiOperation({ summary: 'Check whether a user has a password set' })
  @ApiResponse({ status: 200, type: HasPasswordResponse })
  @Get('/:id/has-password')
  async hasPassword(@Param('id') id: string) {
    // Public: the sign-in UI calls this before the user is authenticated to
    // decide whether to prompt for a password.
    return { hasPassword: await this.userService.hasPassword(id) };
  }

  @ApiOperation({ summary: 'Get a user by id' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @Get('/:id')
  async getUserById(@Req() req: AuthedRequest, @Param('id') id: string) {
    this.assertSelf(req, id);
    return toUserResponse(await this.userService.getUserById(id));
  }

  // --- Profile updates ---

  @ApiOperation({ summary: 'Bulk update profile fields' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/profile')
  async updateProfile(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    this.assertSelf(req, id);
    return toUserResponse(await this.userService.updateProfile(id, dto));
  }

  @ApiOperation({ summary: 'Update first name' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/first-name')
  async updateFirstName(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateFirstNameDto,
  ) {
    this.assertSelf(req, id);
    return toUserResponse(
      await this.userService.updateFirstName(id, dto.firstName),
    );
  }

  @ApiOperation({ summary: 'Update last name (null to clear)' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/last-name')
  async updateLastName(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateLastNameDto,
  ) {
    this.assertSelf(req, id);
    return toUserResponse(
      await this.userService.updateLastName(id, dto.lastName),
    );
  }

  @ApiOperation({
    summary: 'Request an email change (sends a code to the new email)',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  // Tight cap: limits mail-bombing a chosen address with change codes.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Post('/:id/email')
  async requestEmailChange(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RequestEmailChangeDto,
  ) {
    this.assertSelf(req, id);
    return this.userService.requestEmailChange(id, dto.newEmail);
  }

  @ApiOperation({ summary: 'Confirm an email change with the emailed code' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  // Tight cap: makes the 6-digit confirmation code impractical to brute-force.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post('/:id/email/confirm')
  async confirmEmailChange(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    this.assertSelf(req, id);
    return toUserResponse(
      await this.userService.confirmEmailChange(id, dto.code),
    );
  }

  @ApiOperation({ summary: 'Update avatar (url + key from file upload)' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/avatar')
  async updateAvatar(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAvatarDto,
  ) {
    this.assertSelf(req, id);
    return toUserResponse(
      await this.userService.updateAvatar(id, dto.avatarUrl, dto.avatarKey),
    );
  }

  // --- Business ---

  @ApiOperation({ summary: 'Attach a business to the user' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/business')
  async setBusinessId(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SetBusinessIdDto,
  ) {
    this.assertSelf(req, id);
    return toUserResponse(
      await this.userService.setBusinessId(id, dto.businessId),
    );
  }

  // --- Account deletion / restore (soft) ---

  @ApiOperation({ summary: 'Soft-delete the account' })
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Delete('/:id')
  async deleteAccount(@Req() req: AuthedRequest, @Param('id') id: string) {
    this.assertSelf(req, id);
    return toUserResponse(await this.userService.deleteAccount(id));
  }
}

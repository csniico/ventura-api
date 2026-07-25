import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { toUserResponse } from './user.mapper';

/**
 * Postgres-backed v2 of the user API. Mirrors every route, request DTO, and
 * response shape of the legacy `UserController` (Mongo) under `/v2/users`, so
 * clients migrate by changing only the base path.
 */
@ApiTags('Users')
@Controller('users')
export class UserControllerV2 {
  constructor(private readonly userService: UserServiceV2) {}

  // --- Account creation ---

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

  // --- Google account linking ---

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
  @Post('/password')
  async createPassword(@Body() dto: CreatePasswordDto) {
    return toUserResponse(await this.userService.createPassword(dto));
  }

  @ApiOperation({ summary: 'Change an existing password' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Put('/password')
  async updatePassword(@Body() dto: UpdatePasswordDto) {
    return toUserResponse(await this.userService.updatePassword(dto));
  }

  // --- Read ---

  @ApiOperation({ summary: 'Check whether a user has a password set' })
  @ApiResponse({ status: 200, type: HasPasswordResponse })
  @Get('/:id/has-password')
  async hasPassword(@Param('id') id: string) {
    return { hasPassword: await this.userService.hasPassword(id) };
  }

  @ApiOperation({ summary: 'Get a user by id' })
  @ApiResponse({ status: 200, type: UserResponse })
  @Get('/:id')
  async getUserById(@Param('id') id: string) {
    return toUserResponse(await this.userService.getUserById(id));
  }

  // --- Profile updates ---

  @ApiOperation({ summary: 'Bulk update profile fields' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/profile')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateProfileDto) {
    return toUserResponse(await this.userService.updateProfile(id, dto));
  }

  @ApiOperation({ summary: 'Update first name' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/first-name')
  async updateFirstName(
    @Param('id') id: string,
    @Body() dto: UpdateFirstNameDto,
  ) {
    return toUserResponse(
      await this.userService.updateFirstName(id, dto.firstName),
    );
  }

  @ApiOperation({ summary: 'Update last name (null to clear)' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/last-name')
  async updateLastName(
    @Param('id') id: string,
    @Body() dto: UpdateLastNameDto,
  ) {
    return toUserResponse(
      await this.userService.updateLastName(id, dto.lastName),
    );
  }

  @ApiOperation({
    summary: 'Request an email change (sends a code to the new email)',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/:id/email')
  async requestEmailChange(
    @Param('id') id: string,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.userService.requestEmailChange(id, dto.newEmail);
  }

  @ApiOperation({ summary: 'Confirm an email change with the emailed code' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/:id/email/confirm')
  async confirmEmailChange(
    @Param('id') id: string,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return toUserResponse(
      await this.userService.confirmEmailChange(id, dto.code),
    );
  }

  @ApiOperation({ summary: 'Update avatar (url + key from file upload)' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/avatar')
  async updateAvatar(@Param('id') id: string, @Body() dto: UpdateAvatarDto) {
    return toUserResponse(
      await this.userService.updateAvatar(id, dto.avatarUrl, dto.avatarKey),
    );
  }

  // --- Business ---

  @ApiOperation({ summary: 'Attach a business to the user' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/business')
  async setBusinessId(@Param('id') id: string, @Body() dto: SetBusinessIdDto) {
    return toUserResponse(
      await this.userService.setBusinessId(id, dto.businessId),
    );
  }

  // --- Account deletion / restore (soft) ---

  @ApiOperation({ summary: 'Soft-delete the account' })
  @ApiResponse({ status: 200, type: UserResponse })
  @HttpCode(HttpStatus.OK)
  @Delete('/:id')
  async deleteAccount(@Param('id') id: string) {
    return toUserResponse(await this.userService.deleteAccount(id));
  }
}

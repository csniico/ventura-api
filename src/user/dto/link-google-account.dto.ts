import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator'

/**
 * Per-field choice when linking a Google account to an existing user:
 * - `keep`   = leave the current value untouched
 * - `update` = overwrite with the value from the Google payload
 */
export enum LinkFieldAction {
  KEEP = 'keep',
  UPDATE = 'update',
}

/**
 * Which profile fields to keep vs. update from Google.
 * Any field omitted defaults to `update`.
 * (email is the lookup key and googleId is always set, so neither is listed.)
 */
export class GoogleLinkPreferencesDto {
  @ApiProperty({ required: false, enum: LinkFieldAction })
  @IsOptional()
  @IsEnum(LinkFieldAction)
  firstName?: LinkFieldAction

  @ApiProperty({ required: false, enum: LinkFieldAction })
  @IsOptional()
  @IsEnum(LinkFieldAction)
  lastName?: LinkFieldAction

  @ApiProperty({ required: false, enum: LinkFieldAction })
  @IsOptional()
  @IsEnum(LinkFieldAction)
  avatarUrl?: LinkFieldAction
}

export class LinkGoogleAccountDto {
  @ApiProperty({ format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  googleId!: string

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  firstName?: string

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  lastName?: string

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  avatarUrl?: string

  @ApiProperty({ required: false, type: () => GoogleLinkPreferencesDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GoogleLinkPreferencesDto)
  preferences?: GoogleLinkPreferencesDto
}

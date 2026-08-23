import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator'

/**
 * Email signup: the user provides only their first name and email.
 * No password at this stage.
 */
export class CreateUserWithEmailDto {
  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  firstName!: string

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string
}

/**
 * Google signup ("Continue with Google"): values come from the Google payload.
 * avatarUrl is optional (Google may not return a picture).
 */
export class CreateUserWithGoogleDto {
  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  firstName!: string

  @ApiProperty({ required: false, example: 'Lovelace' })
  @IsString()
  @IsOptional()
  lastName?: string

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string

  @ApiProperty({ example: 'google-oauth2|1234567890' })
  @IsString()
  @IsNotEmpty()
  googleId!: string

  @ApiProperty({ required: false, example: 'https://example.com/a.png' })
  @IsString()
  @IsOptional()
  avatarUrl?: string
}

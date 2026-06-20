import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';

/** Email + password sign-in. */
export class SignInPasswordDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'S3curePassw0rd!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

/** Request a passwordless email sign-in code. */
export class SignInEmailDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

/** Verify an emailed 6-digit code. */
export class VerifyCodeDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}

/** Sign in with a Google ID token obtained by the frontend. */
export class SignInGoogleDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

/**
 * Sign in with an Apple identity token from the native (iOS) or web (Android/
 * web) Sign in with Apple flow. The backend verifies it against Apple's public
 * keys — no Apple secret/key is needed.
 */
export class SignInAppleDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...' })
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  // The raw nonce the app generated; Apple embeds SHA256(nonce) in the token.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rawNonce?: string;

  // Apple returns the name ONLY on the first authorization; forwarded then.
  @ApiProperty({ required: false, example: 'Ada' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false, example: 'Lovelace' })
  @IsOptional()
  @IsString()
  lastName?: string;
}

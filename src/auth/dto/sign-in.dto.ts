import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
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

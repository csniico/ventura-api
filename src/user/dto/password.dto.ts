import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';

/**
 * Create a password for a user who does not have one yet
 * (e.g. an email-signup user setting their first password).
 * The user is located by userId + email together.
 */
export class CreatePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ minLength: 12, example: 'sup3r-Secret!pw' })
  @IsString()
  @MinLength(12)
  newPassword!: string;
}

/**
 * Update an existing password: the current password is verified before the
 * new one is set. The user is located by userId + email together.
 */
export class UpdatePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ format: 'email' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @ApiProperty({ minLength: 12, example: 'new-Passw0rd!yy' })
  @IsString()
  @MinLength(12)
  newPassword!: string;
}

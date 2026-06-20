import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Create an admin. If the email already exists, the existing admin is returned. */
export class CreateAdminDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

/** Update an admin's profile. Only the provided fields are changed. */
export class UpdateAdminProfileDto {
  @ApiProperty({ required: false, example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}

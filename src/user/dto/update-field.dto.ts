import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

/** Body for updating the first name. */
export class UpdateFirstNameDto {
  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;
}

/** Body for updating the last name. Pass null to clear it. */
export class UpdateLastNameDto {
  @ApiProperty({ nullable: true, example: 'Lovelace' })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  lastName!: string | null;
}

/**
 * Body for updating the avatar from an uploaded file. Send the fileUrl + fileKey
 * returned by the file-storage presign step. Pass null for both to clear it.
 */
export class UpdateAvatarDto {
  @ApiProperty({ nullable: true, example: 'https://example.com/a.png' })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  avatarUrl!: string | null;

  @ApiProperty({ nullable: true, example: 'avatars/abc.png' })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  avatarKey!: string | null;
}

/** Body for attaching a business to a user. */
export class SetBusinessIdDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsString()
  @IsNotEmpty()
  businessId!: string;
}

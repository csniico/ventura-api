import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, ValidateIf } from 'class-validator'

/**
 * Bulk profile update. All fields are optional; only the ones provided are
 * updated. lastName and avatarUrl may be set to null to clear them.
 */
export class UpdateProfileDto {
  @ApiProperty({ required: false, example: 'Ada' })
  @IsOptional()
  @IsString()
  firstName?: string

  // Allow a string or null (null clears the field).
  @ApiProperty({ required: false, nullable: true, example: 'Lovelace' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  lastName?: string | null

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  avatarUrl?: string | null
}

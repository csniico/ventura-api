import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'

/** Request a presigned upload URL for a file the client will PUT directly to S3. */
export class PresignUploadDto {
  // MIME type, e.g. "image/png". Validated against the allowed-image list.
  @ApiProperty({ example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  contentType!: string

  // Original filename; its extension is used when building the storage key.
  @ApiProperty({ example: 'avatar.png' })
  @IsString()
  @IsNotEmpty()
  filename!: string

  // Optional folder/prefix (e.g. "avatars", "logos"). Letters, numbers, - and _.
  @ApiProperty({ required: false, example: 'avatars' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  folder?: string
}

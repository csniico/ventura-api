import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { UploadFolder } from '../file-storage.constants'

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

  // Destination folder. Closed set — an arbitrary prefix would let a caller
  // write anywhere in the bucket. The caller's owner scope is appended
  // server-side, so this alone does not determine the final key.
  @ApiProperty({ required: false, enum: UploadFolder, example: 'avatars' })
  @IsOptional()
  @IsEnum(UploadFolder)
  folder?: UploadFolder
}

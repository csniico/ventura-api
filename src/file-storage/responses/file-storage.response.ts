import { ApiProperty } from '@nestjs/swagger';

/** Result of requesting a presigned upload URL. */
export class PresignedUploadResponse {
  @ApiProperty({ example: 'avatars/abc123.png' })
  fileKey!: string;

  @ApiProperty({ example: 'https://cdn.example.com/avatars/abc123.png' })
  fileUrl!: string;

  @ApiProperty({
    example: 'https://s3.example.com/bucket/avatars/abc123.png?X-Amz-...',
  })
  uploadUrl!: string;
}

/** Result of deleting a stored file. */
export class DeleteFileResponse {
  @ApiProperty({ example: 'avatars/abc123.png' })
  fileKey!: string;
}

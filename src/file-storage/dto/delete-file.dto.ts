import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Delete a stored file by its S3 object key. */
export class DeleteFileDto {
  @ApiProperty({ example: 'avatars/abc123.png' })
  @IsString()
  @IsNotEmpty()
  fileKey!: string;
}

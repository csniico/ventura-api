import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileStorageService } from './file-storage.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { DeleteFileDto } from './dto/delete-file.dto';
import {
  DeleteFileResponse,
  PresignedUploadResponse,
} from './responses/file-storage.response';

@ApiTags('Files')
@Controller('files')
export class FileStorageController {
  constructor(private readonly fileStorageService: FileStorageService) {}

  /**
   * Request a presigned upload URL. Returns { fileKey, fileUrl, uploadUrl }.
   * The client PUTs the file to uploadUrl, then sends fileKey + fileUrl back
   * to whichever resource it belongs to (e.g. profile photo, business logo).
   */
  @ApiOperation({ summary: 'Request a presigned upload URL' })
  @ApiResponse({ status: 200, type: PresignedUploadResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/presign')
  async presign(@Body() dto: PresignUploadDto) {
    return this.fileStorageService.createPresignedUpload(dto);
  }

  /** Delete a stored file by its key. */
  @ApiOperation({ summary: 'Delete a stored file by its key' })
  @ApiResponse({ status: 200, type: DeleteFileResponse })
  @HttpCode(HttpStatus.OK)
  @Delete()
  async delete(@Body() dto: DeleteFileDto) {
    return this.fileStorageService.deleteFile(dto.fileKey);
  }
}

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { AuthUser } from '../auth/types/auth.types'
import { UserServiceV2 } from '../user/application/user.service'
import { DeleteFileDto } from './dto/delete-file.dto'
import { PresignUploadDto } from './dto/presign-upload.dto'
import { FileOwner, FileStorageService } from './file-storage.service'
import {
  DeleteFileResponse,
  PresignedUploadResponse,
} from './responses/file-storage.response'

interface AuthedRequest {
  user: AuthUser
}

/**
 * Both routes require a valid access token (via the global `JwtAuthGuard`) and
 * act only within the caller's own storage namespace. They were previously
 * unauthenticated, letting anyone mint upload URLs into the bucket and delete
 * any object whose key they could read off a public image URL (SEC-001).
 */
@ApiTags('Files')
@ApiBearerAuth('bearer')
@Controller('files')
export class FileStorageController {
  constructor(
    private readonly fileStorageService: FileStorageService,
    private readonly userService: UserServiceV2,
  ) {}

  /** Resolve the storage namespace the caller may read and write. */
  private async resolveOwner(req: AuthedRequest): Promise<FileOwner> {
    const user = await this.userService.getUserById(req.user.userId)
    return { userId: user.id, businessId: user.businessId }
  }

  /**
   * Request a presigned upload URL. Returns { fileKey, fileUrl, uploadUrl }.
   * The client PUTs the file to uploadUrl, then sends fileKey + fileUrl back
   * to whichever resource it belongs to (e.g. profile photo, business logo).
   */
  @ApiOperation({ summary: 'Request a presigned upload URL' })
  @ApiResponse({ status: 200, type: PresignedUploadResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/presign')
  async presign(@Req() req: AuthedRequest, @Body() dto: PresignUploadDto) {
    return await this.fileStorageService.createPresignedUpload(
      dto,
      await this.resolveOwner(req),
    )
  }

  /** Delete a stored file by its key. Only files the caller owns. */
  @ApiOperation({ summary: 'Delete a stored file by its key' })
  @ApiResponse({ status: 200, type: DeleteFileResponse })
  @HttpCode(HttpStatus.OK)
  @Delete()
  async delete(@Req() req: AuthedRequest, @Body() dto: DeleteFileDto) {
    return await this.fileStorageService.deleteFile(
      dto.fileKey,
      await this.resolveOwner(req),
    )
  }
}

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { nanoid } from 'nanoid'
import { PresignUploadDto } from './dto/presign-upload.dto'
import {
  ALLOWED_IMAGE_TYPES,
  DEFAULT_UPLOAD_FOLDER,
} from './file-storage.constants'

export interface PresignedUpload {
  fileKey: string
  fileUrl: string
  uploadUrl: string
}

/**
 * Who a stored object belongs to. `businessId` is preferred so colleagues in
 * the same business can manage each other's uploads; `userId` is the fallback
 * for people who have not created a business yet (e.g. an avatar set during
 * onboarding). A caller owns an object if either id matches its key scope.
 */
export interface FileOwner {
  userId: string
  businessId?: string | null
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name)
  private readonly client: S3Client
  private readonly bucket: string
  private readonly region: string
  private readonly expiresIn: number

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET_NAME', '')
    this.region = this.configService.get<string>('AWS_REGION', '')
    this.expiresIn = Number(
      this.configService.get<string>('S3_PRESIGN_EXPIRES', '300'),
    )

    if (!this.bucket || !this.region) {
      throw new Error('Missing AWS S3 configuration')
    }

    // Credentials are picked up from the standard AWS env vars / provider chain.
    this.client = new S3Client({ region: this.region })
  }

  /**
   * Generate a presigned PUT URL. The client uploads the file directly to S3
   * with that URL, then sends back fileKey + fileUrl to persist on a resource.
   *
   * The key is `<folder>/<ownerScope>/<random>.<ext>`. Both the folder (a
   * closed enum) and the owner scope come from the server, never the request
   * body, so a caller cannot write outside their own namespace.
   */
  async createPresignedUpload(
    dto: PresignUploadDto,
    owner: FileOwner,
  ): Promise<PresignedUpload> {
    const ext = ALLOWED_IMAGE_TYPES[dto.contentType.toLowerCase()]
    if (!ext) {
      throw new BadRequestException(
        `Unsupported content type: ${dto.contentType}`,
      )
    }

    const folder = dto.folder ?? DEFAULT_UPLOAD_FOLDER
    const fileKey = `${folder}/${this.scopeOf(owner)}/${nanoid(16)}.${ext}`

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: dto.contentType,
    })

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.expiresIn,
    })

    const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${fileKey}`

    return { fileKey, fileUrl, uploadUrl }
  }

  /**
   * Delete an object from the bucket by its key. Used to clean up an old asset
   * when it is replaced (e.g. swapping a profile photo or business logo).
   * S3 delete is idempotent — deleting a missing key still succeeds.
   *
   * File keys are not secret (they appear inside public image URLs), so the
   * key alone is never proof of ownership: the caller's scope must match the
   * one baked into the key.
   */
  async deleteFile(
    fileKey: string,
    owner: FileOwner,
  ): Promise<{ fileKey: string }> {
    this.assertOwns(fileKey, owner)
    return await this.deleteFileInternal(fileKey)
  }

  /**
   * Delete without an ownership check. Only for server-initiated cleanup where
   * the caller has already proven ownership of the *entity* holding the key —
   * replacing a business logo, a user avatar, or a resource photo. Never reachable
   * from a request body.
   */
  async deleteFileInternal(fileKey: string): Promise<{ fileKey: string }> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: fileKey }),
    )
    return { fileKey }
  }

  /** The namespace new uploads are filed under. */
  private scopeOf(owner: FileOwner): string {
    return owner.businessId ?? owner.userId
  }

  /**
   * Reject a key that belongs to someone else.
   *
   * Keys written before scoping existed are `<folder>/<file>` — two segments,
   * no owner to compare against. Those are allowed through (and logged) rather
   * than orphaning every logo and avatar already in the bucket; they age out
   * as users replace their images. Once a key carries a scope it is enforced.
   */
  private assertOwns(fileKey: string, owner: FileOwner): void {
    const segments = fileKey.split('/')
    if (segments.length < 3) {
      this.logger.warn(
        `Legacy unscoped file key deleted by user ${owner.userId}: ${fileKey}`,
      )
      return
    }

    const scope = segments[1]
    if (scope !== owner.userId && scope !== owner.businessId) {
      throw new ForbiddenException('You do not own this file.')
    }
  }
}

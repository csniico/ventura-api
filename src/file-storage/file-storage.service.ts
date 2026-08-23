import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { nanoid } from 'nanoid'
import { PresignUploadDto } from './dto/presign-upload.dto'
import { ALLOWED_IMAGE_TYPES } from './file-storage.constants'

export interface PresignedUpload {
  fileKey: string
  fileUrl: string
  uploadUrl: string
}

@Injectable()
export class FileStorageService {
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
   */
  async createPresignedUpload(dto: PresignUploadDto): Promise<PresignedUpload> {
    const ext = ALLOWED_IMAGE_TYPES[dto.contentType.toLowerCase()]
    if (!ext) {
      throw new BadRequestException(
        `Unsupported content type: ${dto.contentType}`,
      )
    }

    const folder = dto.folder ?? 'uploads'
    const fileKey = `${folder}/${nanoid(16)}.${ext}`

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
   */
  async deleteFile(fileKey: string): Promise<{ fileKey: string }> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: fileKey }),
    )
    return { fileKey }
  }
}

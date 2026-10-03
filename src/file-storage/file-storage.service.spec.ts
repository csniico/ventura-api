import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { UploadFolder } from './file-storage.constants'
import { FileOwner, FileStorageService } from './file-storage.service'

// Mock the presigner so no real AWS request is made.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}))

const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>

const OWNER: FileOwner = { userId: 'user-1', businessId: 'biz-1' }
const NO_BUSINESS: FileOwner = { userId: 'user-2', businessId: null }

describe('FileStorageService', () => {
  let service: FileStorageService

  beforeAll(async () => {
    // Provide the S3 config the service requires at construction.
    process.env.S3_BUCKET_NAME = 'test-bucket'
    process.env.AWS_REGION = 'eu-west-2'
    process.env.S3_PRESIGN_EXPIRES = '300'

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [FileStorageService],
    }).compile()

    service = moduleRef.get(FileStorageService)
  })

  beforeEach(() => {
    mockedGetSignedUrl.mockReset()
    mockedGetSignedUrl.mockResolvedValue('https://signed-url.example/put')
  })

  /** Stub the S3 client's send so no real AWS call is made. */
  const stubSend = () =>
    jest
      .spyOn(
        (service as unknown as { client: { send: jest.Mock } }).client,
        'send',
      )
      .mockResolvedValue(undefined)

  it('returns fileKey, fileUrl and uploadUrl for an allowed image type', async () => {
    const res = await service.createPresignedUpload(
      {
        contentType: 'image/png',
        filename: 'photo.png',
        folder: UploadFolder.AVATARS,
      },
      OWNER,
    )

    expect(res.uploadUrl).toBe('https://signed-url.example/put')
    // Key is folder/<ownerScope>/<id>.<ext>.
    expect(res.fileKey).toMatch(/^avatars\/biz-1\/[A-Za-z0-9_-]+\.png$/)
    // Public URL points at the bucket/region and ends with the key.
    expect(res.fileUrl).toBe(
      `https://test-bucket.s3.eu-west-2.amazonaws.com/${res.fileKey}`,
    )
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('defaults the folder to "uploads" when none is given', async () => {
    const res = await service.createPresignedUpload(
      { contentType: 'image/jpeg', filename: 'pic.jpg' },
      OWNER,
    )
    expect(res.fileKey).toMatch(/^uploads\/biz-1\/[A-Za-z0-9_-]+\.jpg$/)
  })

  it('scopes the key by user id when the caller has no business yet', async () => {
    const res = await service.createPresignedUpload(
      {
        contentType: 'image/png',
        filename: 'me.png',
        folder: UploadFolder.AVATARS,
      },
      NO_BUSINESS,
    )
    expect(res.fileKey).toMatch(/^avatars\/user-2\/[A-Za-z0-9_-]+\.png$/)
  })

  it('rejects an unsupported content type with 400', async () => {
    await expect(
      service.createPresignedUpload(
        { contentType: 'application/pdf', filename: 'doc.pdf' },
        OWNER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(mockedGetSignedUrl).not.toHaveBeenCalled()
  })

  it('deletes a file the caller owns (sends a delete command to S3)', async () => {
    const sendSpy = stubSend()
    const key = 'avatars/biz-1/abc.png'

    const res = await service.deleteFile(key, OWNER)

    expect(res).toEqual({ fileKey: key })
    expect(sendSpy).toHaveBeenCalledTimes(1)
    sendSpy.mockRestore()
  })

  it('deletes a file scoped to the caller by user id', async () => {
    const sendSpy = stubSend()
    await expect(
      service.deleteFile('avatars/user-2/abc.png', NO_BUSINESS),
    ).resolves.toBeDefined()
    expect(sendSpy).toHaveBeenCalledTimes(1)
    sendSpy.mockRestore()
  })

  it("refuses to delete another business's file", async () => {
    const sendSpy = stubSend()

    await expect(
      service.deleteFile('logos/biz-OTHER/stolen.png', OWNER),
    ).rejects.toBeInstanceOf(ForbiddenException)

    // Nothing was sent to S3 — the check runs before the delete.
    expect(sendSpy).not.toHaveBeenCalled()
    sendSpy.mockRestore()
  })

  it('allows a legacy unscoped key through so existing images stay removable', async () => {
    const sendSpy = stubSend()

    await expect(
      service.deleteFile('avatars/legacy.png', OWNER),
    ).resolves.toEqual({ fileKey: 'avatars/legacy.png' })
    expect(sendSpy).toHaveBeenCalledTimes(1)
    sendSpy.mockRestore()
  })

  it('deleteFileInternal skips the ownership check (server-side cleanup)', async () => {
    const sendSpy = stubSend()

    await expect(
      service.deleteFileInternal('logos/biz-OTHER/old.png'),
    ).resolves.toEqual({ fileKey: 'logos/biz-OTHER/old.png' })
    expect(sendSpy).toHaveBeenCalledTimes(1)
    sendSpy.mockRestore()
  })
})

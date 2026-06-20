import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileStorageService } from './file-storage.service';

// Mock the presigner so no real AWS request is made.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

describe('FileStorageService', () => {
  let service: FileStorageService;

  beforeAll(async () => {
    // Provide the S3 config the service requires at construction.
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'eu-west-2';
    process.env.S3_PRESIGN_EXPIRES = '300';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [FileStorageService],
    }).compile();

    service = moduleRef.get(FileStorageService);
  });

  beforeEach(() => {
    mockedGetSignedUrl.mockReset();
    mockedGetSignedUrl.mockResolvedValue('https://signed-url.example/put');
  });

  it('returns fileKey, fileUrl and uploadUrl for an allowed image type', async () => {
    const res = await service.createPresignedUpload({
      contentType: 'image/png',
      filename: 'photo.png',
      folder: 'avatars',
    });

    expect(res.uploadUrl).toBe('https://signed-url.example/put');
    // Key is folder/<id>.<ext>.
    expect(res.fileKey).toMatch(/^avatars\/[A-Za-z0-9_-]+\.png$/);
    // Public URL points at the bucket/region and ends with the key.
    expect(res.fileUrl).toBe(
      `https://test-bucket.s3.eu-west-2.amazonaws.com/${res.fileKey}`,
    );
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('defaults the folder to "uploads" when none is given', async () => {
    const res = await service.createPresignedUpload({
      contentType: 'image/jpeg',
      filename: 'pic.jpg',
    });
    expect(res.fileKey).toMatch(/^uploads\/[A-Za-z0-9_-]+\.jpg$/);
  });

  it('rejects an unsupported content type with 400', async () => {
    await expect(
      service.createPresignedUpload({
        contentType: 'application/pdf',
        filename: 'doc.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('deletes a file by key (sends a delete command to S3)', async () => {
    // Stub the S3 client's send so no real AWS call is made.
    const sendSpy = jest
      .spyOn(
        (service as unknown as { client: { send: jest.Mock } }).client,
        'send',
      )
      .mockResolvedValue(undefined);

    const res = await service.deleteFile('avatars/abc.png');

    expect(res).toEqual({ fileKey: 'avatars/abc.png' });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    sendSpy.mockRestore();
  });
});

import { FileStorageService } from '../file-storage/file-storage.service'

/**
 * A NestJS provider that supplies a mocked FileStorageService for tests, so
 * services depending on it (User, Business) can be instantiated without AWS.
 * The delete methods are no-op jest mocks.
 */
export const mockFileStorageProvider = {
  provide: FileStorageService,
  useValue: {
    deleteFile: jest.fn().mockResolvedValue({ fileKey: 'mock' }),
    // Server-side cleanup path used when an entity's image is replaced.
    deleteFileInternal: jest.fn().mockResolvedValue({ fileKey: 'mock' }),
    createPresignedUpload: jest.fn(),
  },
}

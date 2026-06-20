import { FileStorageService } from '../file-storage/file-storage.service';

/**
 * A NestJS provider that supplies a mocked FileStorageService for tests, so
 * services depending on it (User, Business) can be instantiated without AWS.
 * deleteFile is a no-op jest mock.
 */
export const mockFileStorageProvider = {
  provide: FileStorageService,
  useValue: {
    deleteFile: jest.fn().mockResolvedValue({ fileKey: 'mock' }),
    createPresignedUpload: jest.fn(),
  },
};

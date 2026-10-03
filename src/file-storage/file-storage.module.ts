import { forwardRef, Module } from '@nestjs/common'
import { UserModule } from '../user/user.module'
import { FileStorageController } from './file-storage.controller'
import { FileStorageService } from './file-storage.service'

@Module({
  // UserModule resolves the caller's business id, which scopes every key.
  // forwardRef: UserModule imports FileStorageModule to clean up old avatars.
  imports: [forwardRef(() => UserModule)],
  providers: [FileStorageService],
  controllers: [FileStorageController],
  exports: [FileStorageService],
})
export class FileStorageModule {}

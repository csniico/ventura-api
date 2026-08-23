import { Module } from '@nestjs/common'
import { FileStorageController } from './file-storage.controller'
import { FileStorageService } from './file-storage.service'

@Module({
  providers: [FileStorageService],
  controllers: [FileStorageController],
  exports: [FileStorageService],
})
export class FileStorageModule {}

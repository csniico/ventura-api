import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { ResourceService } from './resource.service';
import { ResourceController } from './resource.controller';
import { Resource, ResourceSchema } from './schemas/resource.schema';

@Module({
  imports: [
    UserModule,
    FileStorageModule,
    MongooseModule.forFeature([
      { name: Resource.name, schema: ResourceSchema },
    ]),
  ],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}

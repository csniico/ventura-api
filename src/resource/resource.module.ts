import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserModule } from '../user/user.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { ResourceService } from './application/resource.service';
import { ResourceController } from './application/resource.controller';
import { PostgresResourceEntity } from './domain/postgres.resource-entity';
import { RESOURCE_DATA_SOURCE } from './domain/resource.repository';
import { PostgresResourceRepository } from './infrastructure/postgres-resource.repository';

@Module({
  imports: [
    UserModule,
    FileStorageModule,
    MikroOrmModule.forFeature([PostgresResourceEntity]),
  ],
  controllers: [ResourceController],
  providers: [
    ResourceService,
    PostgresResourceRepository,
    {
      provide: RESOURCE_DATA_SOURCE,
      useClass: PostgresResourceRepository,
    },
  ],
  exports: [ResourceService],
})
export class ResourceModule {}

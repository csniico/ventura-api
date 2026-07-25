import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserModule } from '../user/user.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { BusinessService } from './application/business.service';
import { BusinessController } from './application/business.controller';
import { PostgresBusinessEntity } from './domain/postgres.business-entity';
import { BUSINESS_DATA_SOURCE } from './domain/business.repository';
import { PostgresBusinessRepository } from './infrastructure/postgres-business.repository';

@Module({
  imports: [
    UserModule,
    FileStorageModule,
    MikroOrmModule.forFeature([PostgresBusinessEntity]),
  ],
  controllers: [BusinessController],
  providers: [
    BusinessService,
    PostgresBusinessRepository,
    {
      provide: BUSINESS_DATA_SOURCE,
      useClass: PostgresBusinessRepository,
    },
  ],
  exports: [BusinessService],
})
export class BusinessModule {}

import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { FileStorageModule } from '../file-storage/file-storage.module'
import { UserModule } from '../user/user.module'
import { BusinessController } from './application/business.controller'
import { BusinessService } from './application/business.service'
import { BUSINESS_DATA_SOURCE } from './domain/business.repository'
import { PostgresBusinessEntity } from './domain/postgres.business-entity'
import { PostgresBusinessRepository } from './infrastructure/postgres-business.repository'

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

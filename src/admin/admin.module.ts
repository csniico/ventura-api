import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { UserModule } from '../user/user.module'
import { AdminProfileService } from './application/admin-profile.service'
import { AdminManageUsersController } from './controllers/admin.manage-users.controller'
import { AdminProfileController } from './controllers/admin-profile.controller'
import { ADMIN_DATA_SOURCE } from './domain/admin.repository'
import { PostgresAdminEntity } from './domain/postgres.admin-entity'
import { PostgresAdminRepository } from './infrastructure/postgres-admin.repository'
import { AdminManageUsersService } from './services/admin.manage-users.service'

@Module({
  imports: [UserModule, MikroOrmModule.forFeature([PostgresAdminEntity])],
  controllers: [AdminProfileController, AdminManageUsersController],
  providers: [
    AdminProfileService,
    AdminManageUsersService,
    { provide: ADMIN_DATA_SOURCE, useClass: PostgresAdminRepository },
  ],
  exports: [AdminProfileService, AdminManageUsersService],
})
export class AdminModule {}

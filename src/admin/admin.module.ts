import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserModule } from '../user/user.module';
import { PostgresAdminEntity } from './domain/postgres.admin-entity';
import { ADMIN_DATA_SOURCE } from './domain/admin.repository';
import { PostgresAdminRepository } from './infrastructure/postgres-admin.repository';
import { AdminProfileService } from './application/admin-profile.service';
import { AdminManageUsersService } from './services/admin.manage-users.service';
import { AdminProfileController } from './controllers/admin-profile.controller';
import { AdminManageUsersController } from './controllers/admin.manage-users.controller';

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

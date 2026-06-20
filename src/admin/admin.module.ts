import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Admin, AdminSchema } from './schemas/admin.schema';
import { AdminProfileService } from './services/admin-profile.service';
import { AdminManageUsersService } from './services/admin.manage-users.service';
import { AdminProfileController } from './controllers/admin-profile.controller';
import { AdminManageUsersController } from './controllers/admin.manage-users.controller';

@Module({
  imports: [
    UserModule,
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminProfileController, AdminManageUsersController],
  providers: [AdminProfileService, AdminManageUsersService],
  exports: [AdminProfileService, AdminManageUsersService],
})
export class AdminModule {}

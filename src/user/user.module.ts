import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { MailModule } from '../mail/mail.module';
import { PostgresUserEntity } from './domain/postgres.user-entity';
import { PostgresEmailChangeEntity } from './domain/postgres.email-change-entity';
import { USER_DATA_SOURCE } from './domain/user.repository';
import { EMAIL_CHANGE_DATA_SOURCE } from './domain/email-change.repository';
import { PostgresUserRepository } from './infrastructure/postgres-user.repository';
import { PostgresEmailChangeRepository } from './infrastructure/postgres-email-change.repository';
import { UserControllerV2 } from './application/user.controller';
import { UserServiceV2 } from './application/user.service';

@Module({
  imports: [
    FileStorageModule,
    MailModule,
    MikroOrmModule.forFeature([PostgresUserEntity, PostgresEmailChangeEntity]),
  ],
  controllers: [UserControllerV2],
  providers: [
    UserServiceV2,
    PostgresUserRepository,
    PostgresEmailChangeRepository,
    {
      provide: USER_DATA_SOURCE,
      useClass: PostgresUserRepository,
    },
    {
      provide: EMAIL_CHANGE_DATA_SOURCE,
      useClass: PostgresEmailChangeRepository,
    },
  ],
  exports: [UserServiceV2, USER_DATA_SOURCE],
})
export class UserModule {}

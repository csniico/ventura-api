import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MailService } from './mail.service';
import { PostgresMailEntity } from './domain/postgres.mail-entity';
import { MAIL_DATA_SOURCE } from './domain/mail.repository';
import { PostgresMailRepository } from './infrastructure/postgres-mail.repository';

@Module({
  imports: [MikroOrmModule.forFeature([PostgresMailEntity])],
  providers: [
    MailService,
    { provide: MAIL_DATA_SOURCE, useClass: PostgresMailRepository },
  ],
  exports: [MailService],
})
export class MailModule {}

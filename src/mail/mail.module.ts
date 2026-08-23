import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { MAIL_DATA_SOURCE } from './domain/mail.repository'
import { PostgresMailEntity } from './domain/postgres.mail-entity'
import { PostgresMailRepository } from './infrastructure/postgres-mail.repository'
import { MailService } from './mail.service'

@Module({
  imports: [MikroOrmModule.forFeature([PostgresMailEntity])],
  providers: [
    MailService,
    { provide: MAIL_DATA_SOURCE, useClass: PostgresMailRepository },
  ],
  exports: [MailService],
})
export class MailModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailService } from './mail.service';
import { Mail, MailSchema } from './schemas/mail.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Mail.name, schema: MailSchema }]),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

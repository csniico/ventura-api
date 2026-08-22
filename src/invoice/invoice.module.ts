import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserModule } from '../user/user.module';
import { OrderModule } from '../order/order.module';
import { MailModule } from '../mail/mail.module';
import { InvoiceService } from './application/invoice.service';
import { InvoiceOverdueTask } from './application/invoice-overdue.task';
import { InvoiceController } from './application/invoice.controller';
import { PostgresInvoiceEntity } from './domain/postgres.invoice-entity';
import { INVOICE_DATA_SOURCE } from './domain/invoice.repository';
import { PostgresInvoiceRepository } from './infrastructure/postgres-invoice.repository';

@Module({
  imports: [
    UserModule,
    OrderModule,
    MailModule,
    MikroOrmModule.forFeature([PostgresInvoiceEntity]),
  ],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceOverdueTask,
    PostgresInvoiceRepository,
    {
      provide: INVOICE_DATA_SOURCE,
      useClass: PostgresInvoiceRepository,
    },
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}

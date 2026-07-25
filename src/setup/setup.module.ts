import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { CustomerModule } from '../customer/customer.module';
import { ResourceModule } from '../resource/resource.module';
import { OrderModule } from '../order/order.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { AppointmentModule } from '../appointment/appointment.module';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

@Module({
  imports: [
    UserModule,
    CustomerModule,
    ResourceModule,
    OrderModule,
    InvoiceModule,
    AppointmentModule,
  ],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}

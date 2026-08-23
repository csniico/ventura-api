import { Module } from '@nestjs/common'
import { AppointmentModule } from '../appointment/appointment.module'
import { CustomerModule } from '../customer/customer.module'
import { InvoiceModule } from '../invoice/invoice.module'
import { OrderModule } from '../order/order.module'
import { ResourceModule } from '../resource/resource.module'
import { UserModule } from '../user/user.module'
import { SetupController } from './setup.controller'
import { SetupService } from './setup.service'

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

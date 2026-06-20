import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { Customer, CustomerSchema } from '../customer/schemas/customer.schema';
import { Resource, ResourceSchema } from '../resource/schemas/resource.schema';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { Invoice, InvoiceSchema } from '../invoice/schemas/invoice.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../appointment/schemas/appointment.schema';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

@Module({
  imports: [
    UserModule,
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Resource.name, schema: ResourceSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}

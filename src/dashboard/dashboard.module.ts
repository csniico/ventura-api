import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Invoice, InvoiceSchema } from '../invoice/schemas/invoice.schema';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { Resource, ResourceSchema } from '../resource/schemas/resource.schema';

@Module({
  imports: [
    UserModule,
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Resource.name, schema: ResourceSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

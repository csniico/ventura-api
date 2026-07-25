import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { ResourceModule } from '../resource/resource.module';
import { OrderModule } from '../order/order.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [UserModule, ResourceModule, OrderModule, InvoiceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

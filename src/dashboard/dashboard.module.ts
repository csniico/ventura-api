import { Module } from '@nestjs/common'
import { InvoiceModule } from '../invoice/invoice.module'
import { OrderModule } from '../order/order.module'
import { ResourceModule } from '../resource/resource.module'
import { UserModule } from '../user/user.module'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  imports: [UserModule, ResourceModule, OrderModule, InvoiceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

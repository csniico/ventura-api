import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { CustomerModule } from '../customer/customer.module'
import { ResourceModule } from '../resource/resource.module'
import { UserModule } from '../user/user.module'
import { OrderController } from './application/order.controller'
import { OrderService } from './application/order.service'
import { ORDER_DATA_SOURCE } from './domain/order.repository'
import { PostgresOrderEntity } from './domain/postgres.order-entity'
import { PostgresOrderRepository } from './infrastructure/postgres-order.repository'

@Module({
  imports: [
    UserModule,
    CustomerModule,
    ResourceModule,
    MikroOrmModule.forFeature([PostgresOrderEntity]),
  ],
  controllers: [OrderController],
  providers: [
    OrderService,
    PostgresOrderRepository,
    {
      provide: ORDER_DATA_SOURCE,
      useClass: PostgresOrderRepository,
    },
  ],
  exports: [OrderService],
})
export class OrderModule {}

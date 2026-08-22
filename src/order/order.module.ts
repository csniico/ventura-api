import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserModule } from '../user/user.module';
import { CustomerModule } from '../customer/customer.module';
import { ResourceModule } from '../resource/resource.module';
import { OrderService } from './application/order.service';
import { OrderController } from './application/order.controller';
import { PostgresOrderEntity } from './domain/postgres.order-entity';
import { ORDER_DATA_SOURCE } from './domain/order.repository';
import { PostgresOrderRepository } from './infrastructure/postgres-order.repository';

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

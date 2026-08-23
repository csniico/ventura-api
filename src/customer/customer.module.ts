import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { UserModule } from '../user/user.module'
import { CustomerController } from './application/customer.controller'
import { CustomerService } from './application/customer.service'
import { CUSTOMER_DATA_SOURCE } from './domain/customer.repository'
import { PostgresCustomerEntity } from './domain/postgres.customer-entity'
import { PostgresCustomerRepository } from './infrastructure/postgres-customer.repository'

@Module({
  imports: [UserModule, MikroOrmModule.forFeature([PostgresCustomerEntity])],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    PostgresCustomerRepository,
    {
      provide: CUSTOMER_DATA_SOURCE,
      useClass: PostgresCustomerRepository,
    },
  ],
  exports: [CustomerService],
})
export class CustomerModule {}

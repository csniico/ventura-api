import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { CustomerModule } from '../customer/customer.module'
import { UserModule } from '../user/user.module'
import { AppointmentController } from './application/appointment.controller'
import { AppointmentService } from './application/appointment.service'
import { APPOINTMENT_DATA_SOURCE } from './domain/appointment.repository'
import { PostgresAppointmentEntity } from './domain/postgres.appointment-entity'
import { PostgresAppointmentRepository } from './infrastructure/postgres-appointment.repository'

@Module({
  imports: [
    UserModule,
    CustomerModule,
    MikroOrmModule.forFeature([PostgresAppointmentEntity]),
  ],
  controllers: [AppointmentController],
  providers: [
    AppointmentService,
    PostgresAppointmentRepository,
    {
      provide: APPOINTMENT_DATA_SOURCE,
      useClass: PostgresAppointmentRepository,
    },
  ],
  exports: [AppointmentService],
})
export class AppointmentModule {}

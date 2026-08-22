import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserModule } from '../user/user.module';
import { CustomerModule } from '../customer/customer.module';
import { AppointmentService } from './application/appointment.service';
import { AppointmentController } from './application/appointment.controller';
import { PostgresAppointmentEntity } from './domain/postgres.appointment-entity';
import { APPOINTMENT_DATA_SOURCE } from './domain/appointment.repository';
import { PostgresAppointmentRepository } from './infrastructure/postgres-appointment.repository';

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

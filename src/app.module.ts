import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { FileStorageModule } from './file-storage/file-storage.module';
import { CustomerModule } from './customer/customer.module';
import { ResourceModule } from './resource/resource.module';
import { OrderModule } from './order/order.module';
import { InvoiceModule } from './invoice/invoice.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';
import { SetupModule } from './setup/setup.module';
import { AppointmentModule } from './appointment/appointment.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 10,
    }),
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/ventura',
        ),
      }),
      inject: [ConfigService],
    }),
    UserModule,
    AdminModule,
    MailModule,
    AuthModule,
    BusinessModule,
    FileStorageModule,
    CustomerModule,
    AppointmentModule,
    ResourceModule,
    OrderModule,
    InvoiceModule,
    DashboardModule,
    SearchModule,
    SetupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Log every incoming request across all routes.
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}

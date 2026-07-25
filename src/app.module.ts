import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

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
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('PG_HOST', 'localhost');
        const password = configService.get<string>(
          'PG_PASSWORD',
          'adminUser!234',
        );
        const dbName = configService.get<string>('PG_DBNAME', 'ventura_dev');
        const user = configService.get<string>('PG_USER', 'postgres');
        return {
          driver: PostgreSqlDriver,
          dbName: dbName,
          user: user,
          password: password,
          host: host,
          port: 5432,
          autoLoadEntities: true,
          schema: 'public',
        };
      },
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

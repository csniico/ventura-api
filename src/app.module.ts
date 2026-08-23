import { MikroOrmModule } from '@mikro-orm/nestjs'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AdminModule } from './admin/admin.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AppointmentModule } from './appointment/appointment.module'
import { AuthModule } from './auth/auth.module'
import { BusinessModule } from './business/business.module'
import { LoggerMiddleware } from './common/middleware/logger.middleware'
import { CustomerModule } from './customer/customer.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { FileStorageModule } from './file-storage/file-storage.module'
import { InvoiceModule } from './invoice/invoice.module'
import { MailModule } from './mail/mail.module'
import { OrderModule } from './order/order.module'
import { ResourceModule } from './resource/resource.module'
import { SearchModule } from './search/search.module'
import { SetupModule } from './setup/setup.module'
import { UserModule } from './user/user.module'

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
    // Global rate limiting (per client IP). A sane default cap protects every
    // route; auth/code endpoints add their own tighter `@Throttle(...)`.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    // Enables @Cron jobs (e.g. the daily invoice-overdue sweep).
    ScheduleModule.forRoot(),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('PG_HOST', 'localhost')
        const password = configService.get<string>(
          'PG_PASSWORD',
          'adminUser!234',
        )
        const dbName = configService.get<string>('PG_DBNAME', 'ventura_dev')
        const user = configService.get<string>('PG_USER', 'postgres')
        return {
          driver: PostgreSqlDriver,
          dbName: dbName,
          user: user,
          password: password,
          host: host,
          port: 5432,
          autoLoadEntities: true,
          schema: 'public',
        }
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
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Log every incoming request across all routes.
    consumer.apply(LoggerMiddleware).forRoutes('*')
  }
}

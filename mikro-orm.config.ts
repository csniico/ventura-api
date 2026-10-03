import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql'
import 'dotenv/config'
import { Migrator } from '@mikro-orm/migrations'
import { PostgresAdminEntity } from './src/admin/domain/postgres.admin-entity'
import { PostgresAppointmentEntity } from './src/appointment/domain/postgres.appointment-entity'
import { PostgresVerificationCodeEntity } from './src/auth/domain/postgres.verification-code-entity'
import { PostgresBusinessEntity } from './src/business/domain/postgres.business-entity'
import { postgresSslOptions } from './src/common/db-ssl'
import { PostgresCustomerEntity } from './src/customer/domain/postgres.customer-entity'
import { PostgresInvoiceEntity } from './src/invoice/domain/postgres.invoice-entity'
import { PostgresMailEntity } from './src/mail/domain/postgres.mail-entity'
import { PostgresOrderEntity } from './src/order/domain/postgres.order-entity'
import { PostgresResourceEntity } from './src/resource/domain/postgres.resource-entity'
import { PostgresEmailChangeEntity } from './src/user/domain/postgres.email-change-entity'
import { PostgresUserEntity } from './src/user/domain/postgres.user-entity'

export default defineConfig({
  driver: PostgreSqlDriver,
  clientUrl: process.env.PG_URI,
  schema: 'public',
  driverOptions: {
    ssl: postgresSslOptions(),
  },
  entities: [
    PostgresUserEntity,
    PostgresEmailChangeEntity,
    PostgresBusinessEntity,
    PostgresCustomerEntity,
    PostgresResourceEntity,
    PostgresOrderEntity,
    PostgresInvoiceEntity,
    PostgresAppointmentEntity,
    PostgresAdminEntity,
    PostgresMailEntity,
    PostgresVerificationCodeEntity,
  ],
  extensions: [Migrator],
  migrations: {
    path: 'dist/migrations',
    pathTs: 'migrations',
  },
})

import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { MailModule } from '../mail/mail.module'
import { UserModule } from '../user/user.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PostgresVerificationCodeEntity } from './domain/postgres.verification-code-entity'
import { VERIFICATION_CODE_DATA_SOURCE } from './domain/verification-code.repository'
import { PostgresVerificationCodeRepository } from './infrastructure/postgres-verification-code.repository'
import { JwtStrategy } from './strategies/jwt.strategy'
import { RefreshJwtStrategy } from './strategies/refresh-jwt.strategy'

@Module({
  imports: [
    UserModule,
    MailModule,
    PassportModule,
    // Secrets/expiry are passed per-sign call in AuthService, so register bare.
    JwtModule.register({}),
    MikroOrmModule.forFeature([PostgresVerificationCodeEntity]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshJwtStrategy,
    {
      provide: VERIFICATION_CODE_DATA_SOURCE,
      useClass: PostgresVerificationCodeRepository,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}

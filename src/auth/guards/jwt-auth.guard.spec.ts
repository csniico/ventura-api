import { Controller, Get, INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { Public } from '../decorators/public.decorator'
import { JwtStrategy } from '../strategies/jwt.strategy'
import { JwtAuthGuard } from './jwt-auth.guard'

/**
 * Exercises the fail-closed policy over real HTTP rather than by inspecting
 * decorators: a controller with no guard of its own must answer 401, and only
 * `@Public()` must get through. This is the behaviour that was missing when
 * `/files` shipped wide open (SEC-001).
 */
@Controller('probe')
class ProbeController {
  // Deliberately no @UseGuards — the global guard has to cover it.
  @Get('/private')
  privateRoute() {
    return { ok: true }
  }

  @Public()
  @Get('/public')
  publicRoute() {
    return { ok: true }
  }
}

@Public()
@Controller('open')
class PubliclyMarkedController {
  @Get('/one')
  one() {
    return { ok: true }
  }
}

describe('JwtAuthGuard (global)', () => {
  let app: INestApplication

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-access-secret'

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PassportModule],
      controllers: [ProbeController, PubliclyMarkedController],
      providers: [JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects an unguarded route with no token', async () => {
    await request(app.getHttpServer()).get('/probe/private').expect(401)
  })

  it('rejects an unguarded route with a garbage token', async () => {
    await request(app.getHttpServer())
      .get('/probe/private')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401)
  })

  it('lets a @Public() route through', async () => {
    await request(app.getHttpServer()).get('/probe/public').expect(200)
  })

  it('honours @Public() applied to the whole controller', async () => {
    await request(app.getHttpServer()).get('/open/one').expect(200)
  })
})

import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppController } from './../src/app.controller'
import { AppService } from './../src/app.service'

describe('AppController (e2e)', () => {
  let app: INestApplication<App>

  // Boot only the root controller + service. Importing the whole AppModule
  // would spin up the MikroORM connection pool and the ScheduleModule cron,
  // which need a live database and leave open handles — neither is relevant to
  // this HTTP smoke test.
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  // Close the app so no server/handles linger after the suite.
  afterAll(async () => {
    await app.close()
  })

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!')
  })
})

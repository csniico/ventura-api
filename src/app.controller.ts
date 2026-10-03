import { Controller, Get } from '@nestjs/common'
import { AppService } from './app.service'
import { Public } from './auth/decorators/public.decorator'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Liveness probe — must answer without a token. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello()
  }
}

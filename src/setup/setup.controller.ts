import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AuthUser } from '../auth/types/auth.types'
import { SetupStatusResponse } from './responses/setup-status.response'
import { SetupService } from './setup.service'

interface AuthedRequest {
  user: AuthUser
}

@ApiTags('Setup')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  /** First-run setup progress for the authenticated user. */
  @ApiOperation({ summary: "Get the user's first-run setup status" })
  @ApiResponse({ status: 200, type: SetupStatusResponse })
  @Get('/status')
  async status(@Req() req: AuthedRequest) {
    return await this.setupService.getStatus(req.user.userId)
  }
}

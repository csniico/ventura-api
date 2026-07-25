import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { UserServiceV2 } from '../user/application/user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth.types';
import { DashboardSummaryResponse } from './responses/dashboard.response';

interface AuthedRequest {
  user: AuthUser;
}

/** Accepted `range` values mapped to a number of days. */
const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

@ApiTags('Dashboard')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly userService: UserServiceV2,
  ) {}

  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before viewing the dashboard.',
      );
    }
    return user.businessId;
  }

  /**
   * Dashboard summary for the home screen: revenue + trend, inventory, recent
   * invoices, and a daily revenue series. `range` controls the chart window
   * (7 or 30 days; defaults to 30).
   */
  @ApiOperation({ summary: 'Get dashboard summary' })
  @ApiQuery({
    name: 'range',
    required: false,
    enum: ['7d', '30d', '90d'],
    description: 'Chart window. Defaults to 30d.',
  })
  @ApiResponse({ status: 200, type: DashboardSummaryResponse })
  @Get('/summary')
  async getSummary(@Req() req: AuthedRequest, @Query('range') range?: string) {
    const businessId = await this.resolveBusinessId(req);
    const rangeDays = RANGE_DAYS[range ?? ''] ?? 30;
    return this.dashboardService.getSummary(businessId, rangeDays);
  }
}

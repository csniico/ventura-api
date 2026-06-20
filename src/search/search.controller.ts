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
import { SearchService } from './search.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth.types';
import { SearchResultsResponse } from './responses/search.response';

interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Search')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly userService: UserService,
  ) {}

  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before searching.',
      );
    }
    return user.businessId;
  }

  /** Cross-entity search across the caller's customers, resources, orders, invoices. */
  @ApiOperation({ summary: 'Global search across all resources' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query.' })
  @ApiResponse({ status: 200, type: SearchResultsResponse })
  @Get()
  async search(@Req() req: AuthedRequest, @Query('q') q?: string) {
    const businessId = await this.resolveBusinessId(req);
    return this.searchService.search(businessId, q ?? '');
  }
}

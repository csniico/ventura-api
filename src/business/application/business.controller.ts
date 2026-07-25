import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { toBusinessResponse } from './business.mapper';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthUser } from '../../auth/types/auth.types';
import { CreateBusinessDto } from '../dto/create-business.dto';
import { UpdateBusinessDto } from '../dto/update-business.dto';
import { BusinessResponse } from '../responses/business.response';

interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Business')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  /** Suggested categories for the UI. Static — declared before /:id. */
  @ApiOperation({ summary: 'List suggested business categories' })
  @ApiResponse({
    status: 200,
    schema: { type: 'array', items: { type: 'string' } },
  })
  @Get('/categories')
  getCategories() {
    return this.businessService.getCategories();
  }

  /** The business owned by the authenticated user (or null). */
  @ApiOperation({ summary: "Get the authenticated user's business" })
  @ApiResponse({ status: 200, type: BusinessResponse })
  @Get('/mine')
  async getMine(@Req() req: AuthedRequest) {
    const business = await this.businessService.getByOwner(req.user.userId);
    return business ? toBusinessResponse(business) : null;
  }

  /** Create a business owned by the authenticated user. */
  @ApiOperation({ summary: 'Create a business' })
  @ApiResponse({ status: 201, type: BusinessResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateBusinessDto) {
    return toBusinessResponse(
      await this.businessService.create(req.user.userId, dto),
    );
  }

  /** Get a business by id. */
  @ApiOperation({ summary: 'Get a business by id' })
  @ApiResponse({ status: 200, type: BusinessResponse })
  @Get('/:id')
  async getById(@Param('id') id: string) {
    return toBusinessResponse(await this.businessService.getById(id));
  }

  /** Update a business the authenticated user owns. */
  @ApiOperation({ summary: 'Update a business' })
  @ApiResponse({ status: 200, type: BusinessResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return toBusinessResponse(
      await this.businessService.update(id, req.user.userId, dto),
    );
  }
}

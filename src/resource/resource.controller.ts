import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResourceService } from './resource.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth.types';
import { paginatedResponse } from '../common/dto/paginated-response';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ListResourceQueryDto } from './dto/list-resource-query.dto';
import { ResourceResponse } from './responses/resource.response';

interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Resources')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('resources')
export class ResourceController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly userService: UserService,
  ) {}

  /** Resolve the caller's business id, or fail if they have no business yet. */
  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before managing resources.',
      );
    }
    return user.businessId;
  }

  /** Create a product or service. */
  @ApiOperation({ summary: 'Create a resource (product or service)' })
  @ApiResponse({ status: 201, type: ResourceResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateResourceDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.resourceService.create(businessId, dto);
  }

  /** List resources, optionally filtered by ?type=product|service. */
  @ApiOperation({ summary: 'List resources (paginated, searchable)' })
  @ApiOkResponse({ type: paginatedResponse(ResourceResponse) })
  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListResourceQueryDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.resourceService.list(businessId, query);
  }

  /** Get a resource by id. */
  @ApiOperation({ summary: 'Get a resource by id' })
  @ApiResponse({ status: 200, type: ResourceResponse })
  @Get('/:id')
  async getById(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return this.resourceService.getById(businessId, id);
  }

  /** Update a resource. */
  @ApiOperation({ summary: 'Update a resource' })
  @ApiResponse({ status: 200, type: ResourceResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.resourceService.update(businessId, id, dto);
  }

  /** Delete a resource. */
  @ApiOperation({ summary: 'Delete a resource' })
  @ApiResponse({ status: 200, type: ResourceResponse })
  @HttpCode(HttpStatus.OK)
  @Delete('/:id')
  async delete(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return this.resourceService.delete(businessId, id);
  }
}

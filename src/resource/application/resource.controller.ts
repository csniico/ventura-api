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
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { AuthUser } from '../../auth/types/auth.types'
import { paginate } from '../../common/dto/paginated'
import { paginatedResponse } from '../../common/dto/paginated-response'
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto'
import { UserServiceV2 } from '../../user/application/user.service'
import { CreateResourceDto } from '../dto/create-resource.dto'
import { CreateStockAdjustmentDto } from '../dto/create-stock-adjustment.dto'
import { ListResourceQueryDto } from '../dto/list-resource-query.dto'
import { UpdateResourceDto } from '../dto/update-resource.dto'
import { ResourceResponse } from '../responses/resource.response'
import { StockAdjustmentResponse } from '../responses/stock-adjustment.response'
import { toResourceResponse } from './resource.mapper'
import { ResourceService } from './resource.service'
import { toStockAdjustmentResponse } from './stock-adjustment.mapper'

interface AuthedRequest {
  user: AuthUser
}

@ApiTags('Resources')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('resources')
export class ResourceController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly userService: UserServiceV2,
  ) {}

  /** Resolve the caller's business id, or fail if they have no business yet. */
  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId)
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before managing resources.',
      )
    }
    return user.businessId
  }

  /** Create a product or service. */
  @ApiOperation({ summary: 'Create a resource (product or service)' })
  @ApiResponse({ status: 201, type: ResourceResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateResourceDto) {
    const businessId = await this.resolveBusinessId(req)
    return toResourceResponse(
      await this.resourceService.create(businessId, dto),
    )
  }

  /** List resources, optionally filtered by ?type=product|service. */
  @ApiOperation({ summary: 'List resources (paginated, searchable)' })
  @ApiOkResponse({ type: paginatedResponse(ResourceResponse) })
  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListResourceQueryDto) {
    const businessId = await this.resolveBusinessId(req)
    const page = await this.resourceService.list(businessId, query)
    return paginate(
      page.data.map(toResourceResponse),
      page.meta.total,
      page.meta.page,
      page.meta.limit,
    )
  }

  /** Get a resource by id. */
  @ApiOperation({ summary: 'Get a resource by id' })
  @ApiResponse({ status: 200, type: ResourceResponse })
  @Get('/:id')
  async getById(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req)
    return toResourceResponse(
      await this.resourceService.getById(businessId, id),
    )
  }

  /** Record a manual stock adjustment against a product. */
  @ApiOperation({ summary: 'Record a manual stock adjustment (product)' })
  @ApiResponse({ status: 201, type: StockAdjustmentResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post('/:id/stock-adjustments')
  async adjustStock(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    const businessId = await this.resolveBusinessId(req)
    return toStockAdjustmentResponse(
      await this.resourceService.adjustStock(
        businessId,
        id,
        dto,
        req.user.userId,
      ),
    )
  }

  /** List a product's stock-adjustment history. */
  @ApiOperation({ summary: 'List stock-adjustment history (paginated)' })
  @ApiOkResponse({ type: paginatedResponse(StockAdjustmentResponse) })
  @Get('/:id/stock-adjustments')
  async listAdjustments(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    const businessId = await this.resolveBusinessId(req)
    const page = await this.resourceService.listAdjustments(
      businessId,
      id,
      query,
    )
    return paginate(
      page.data.map(toStockAdjustmentResponse),
      page.meta.total,
      page.meta.page,
      page.meta.limit,
    )
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
    const businessId = await this.resolveBusinessId(req)
    return toResourceResponse(
      await this.resourceService.update(businessId, id, dto),
    )
  }

  /** Delete a resource. */
  @ApiOperation({ summary: 'Delete a resource' })
  @ApiResponse({ status: 200, type: ResourceResponse })
  @HttpCode(HttpStatus.OK)
  @Delete('/:id')
  async delete(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req)
    return toResourceResponse(await this.resourceService.delete(businessId, id))
  }
}

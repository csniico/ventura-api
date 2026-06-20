import {
  Body,
  Controller,
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
import { OrderService } from './order.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth.types';
import { paginatedResponse } from '../common/dto/paginated-response';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ListOrderQueryDto } from './dto/list-order-query.dto';
import { OrderResponse } from './responses/order.response';

interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Orders')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly userService: UserService,
  ) {}

  /** Resolve the caller's business id, or fail if they have no business yet. */
  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before managing orders.',
      );
    }
    return user.businessId;
  }

  /** Create an order. */
  @ApiOperation({ summary: 'Create an order' })
  @ApiResponse({ status: 201, type: OrderResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateOrderDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.orderService.create(businessId, dto);
  }

  /** List orders, optionally filtered by ?status and ?customerId. */
  @ApiOperation({ summary: 'List orders (paginated, searchable)' })
  @ApiOkResponse({ type: paginatedResponse(OrderResponse) })
  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListOrderQueryDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.orderService.list(businessId, query);
  }

  /** Get an order by id. */
  @ApiOperation({ summary: 'Get an order by id' })
  @ApiResponse({ status: 200, type: OrderResponse })
  @Get('/:id')
  async getById(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return this.orderService.getById(businessId, id);
  }

  /** Edit the line items of a pending order. */
  @ApiOperation({ summary: 'Edit the items of a pending order' })
  @ApiResponse({ status: 200, type: OrderResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id')
  async updateItems(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.orderService.updateItems(businessId, id, dto.items);
  }

  /** Update an order's status (e.g. complete or cancel). */
  @ApiOperation({ summary: "Update an order's status" })
  @ApiResponse({ status: 200, type: OrderResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/status')
  async updateStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.orderService.updateStatus(businessId, id, dto.status);
  }
}

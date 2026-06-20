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
import { CustomerService } from './customer.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth.types';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginatedResponse } from '../common/dto/paginated-response';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import {
  BulkImportResultResponse,
  CustomerResponse,
} from './responses/customer.response';

interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Customers')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly userService: UserService,
  ) {}

  /** Resolve the caller's business id, or fail if they have no business yet. */
  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before managing customers.',
      );
    }
    return user.businessId;
  }

  /** Create a single customer. */
  @ApiOperation({ summary: 'Create a customer' })
  @ApiResponse({ status: 201, type: CustomerResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateCustomerDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.customerService.create(businessId, dto);
  }

  /** Bulk import customers (e.g. from phone contacts). */
  @ApiOperation({ summary: 'Bulk import customers' })
  @ApiResponse({ status: 201, type: BulkImportResultResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post('/import')
  async importCustomers(
    @Req() req: AuthedRequest,
    @Body() dto: ImportCustomersDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.customerService.bulkCreate(businessId, dto.customers);
  }

  /** List the caller's business customers, newest first (paginated). */
  @ApiOperation({ summary: 'List customers (paginated, searchable)' })
  @ApiOkResponse({ type: paginatedResponse(CustomerResponse) })
  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: PaginationQueryDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.customerService.list(businessId, query);
  }

  /** Get a customer by id. */
  @ApiOperation({ summary: 'Get a customer by id' })
  @ApiResponse({ status: 200, type: CustomerResponse })
  @Get('/:id')
  async getById(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return this.customerService.getById(businessId, id);
  }

  /** Update a customer by id. */
  @ApiOperation({ summary: 'Update a customer by id' })
  @ApiResponse({ status: 200, type: CustomerResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.customerService.update(businessId, id, dto);
  }

  /** Delete a customer by id. */
  @ApiOperation({ summary: 'Delete a customer by id' })
  @ApiResponse({ status: 200, type: CustomerResponse })
  @HttpCode(HttpStatus.OK)
  @Delete('/:id')
  async delete(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return this.customerService.delete(businessId, id);
  }
}

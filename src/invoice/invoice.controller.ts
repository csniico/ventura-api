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
import { InvoiceService } from './invoice.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth.types';
import { paginatedResponse } from '../common/dto/paginated-response';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { ListInvoiceQueryDto } from './dto/list-invoice-query.dto';
import { InvoiceResponse } from './responses/invoice.response';

interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Invoices')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly userService: UserService,
  ) {}

  /** Resolve the caller's business id, or fail if they have no business yet. */
  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before managing invoices.',
      );
    }
    return user.businessId;
  }

  /** Create an invoice from existing orders. */
  @ApiOperation({ summary: 'Create an invoice from existing orders' })
  @ApiResponse({ status: 201, type: InvoiceResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateInvoiceDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.invoiceService.create(businessId, dto);
  }

  /** List invoices, optionally filtered by ?status and ?customerId. */
  @ApiOperation({ summary: 'List invoices (paginated, searchable)' })
  @ApiOkResponse({ type: paginatedResponse(InvoiceResponse) })
  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: ListInvoiceQueryDto) {
    const businessId = await this.resolveBusinessId(req);
    return this.invoiceService.list(businessId, query);
  }

  /** Get an invoice by id. */
  @ApiOperation({ summary: 'Get an invoice by id' })
  @ApiResponse({ status: 200, type: InvoiceResponse })
  @Get('/:id')
  async getById(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return this.invoiceService.getById(businessId, id);
  }

  /** Record a payment against an invoice. */
  @ApiOperation({ summary: 'Record a payment against an invoice' })
  @ApiResponse({ status: 200, type: InvoiceResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/payment')
  async recordPayment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.invoiceService.recordPayment(businessId, id, dto);
  }

  /** Send an invoice to the customer. */
  @ApiOperation({ summary: 'Send an invoice to the customer' })
  @ApiResponse({ status: 200, type: InvoiceResponse })
  @HttpCode(HttpStatus.OK)
  @Post('/:id/send')
  async send(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SendInvoiceDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.invoiceService.send(businessId, id, dto);
  }

  /** Update an invoice's status. */
  @ApiOperation({ summary: "Update an invoice's status" })
  @ApiResponse({ status: 200, type: InvoiceResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/status')
  async updateStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return this.invoiceService.updateStatus(businessId, id, dto.status);
  }
}

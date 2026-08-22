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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppointmentService } from './appointment.service';
import { toAppointmentResponse } from './appointment.mapper';
import { UserServiceV2 } from '../../user/application/user.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthUser } from '../../auth/types/auth.types';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { UpdateAppointmentStatusDto } from '../dto/update-appointment-status.dto';
import { AppointmentResponse } from '../responses/appointment.response';

interface AuthedRequest {
  user: AuthUser;
}

@ApiTags('Appointments')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly userService: UserServiceV2,
  ) {}

  /** Resolve the caller's business id, or fail if they have no business yet. */
  private async resolveBusinessId(req: AuthedRequest): Promise<string> {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user.businessId) {
      throw new ForbiddenException(
        'You must create a business before managing appointments.',
      );
    }
    return user.businessId;
  }

  /** Create an appointment. */
  @ApiOperation({ summary: 'Create an appointment' })
  @ApiResponse({ status: 201, type: AppointmentResponse })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateAppointmentDto) {
    const businessId = await this.resolveBusinessId(req);
    return toAppointmentResponse(
      await this.appointmentService.create(businessId, req.user.userId, dto),
    );
  }

  /** List appointments, optionally filtered by start date range (from/to). */
  @ApiOperation({ summary: 'List appointments' })
  @ApiResponse({ status: 200, type: AppointmentResponse, isArray: true })
  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const businessId = await this.resolveBusinessId(req);
    const appointments = await this.appointmentService.list(
      businessId,
      from,
      to,
    );
    return appointments.map(toAppointmentResponse);
  }

  /** Get an appointment by id. */
  @ApiOperation({ summary: 'Get an appointment by id' })
  @ApiResponse({ status: 200, type: AppointmentResponse })
  @Get('/:id')
  async getById(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return toAppointmentResponse(
      await this.appointmentService.getById(businessId, id),
    );
  }

  /** Update an appointment. */
  @ApiOperation({ summary: 'Update an appointment' })
  @ApiResponse({ status: 200, type: AppointmentResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return toAppointmentResponse(
      await this.appointmentService.update(businessId, id, dto),
    );
  }

  /** Mark an appointment scheduled / completed / attended / cancelled. */
  @ApiOperation({ summary: "Update an appointment's status" })
  @ApiResponse({ status: 200, type: AppointmentResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id/status')
  async updateStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    const businessId = await this.resolveBusinessId(req);
    return toAppointmentResponse(
      await this.appointmentService.updateStatus(businessId, id, dto.status),
    );
  }

  /** Delete an appointment. */
  @ApiOperation({ summary: 'Delete an appointment' })
  @ApiResponse({ status: 200, type: AppointmentResponse })
  @HttpCode(HttpStatus.OK)
  @Delete('/:id')
  async delete(@Req() req: AuthedRequest, @Param('id') id: string) {
    const businessId = await this.resolveBusinessId(req);
    return toAppointmentResponse(
      await this.appointmentService.delete(businessId, id),
    );
  }
}

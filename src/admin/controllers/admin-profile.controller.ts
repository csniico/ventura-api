import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { AdminGuard } from '../../auth/guards/admin.guard'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { toAdminResponse } from '../application/admin.mapper'
import { AdminProfileService } from '../application/admin-profile.service'
import { CreateAdminDto, UpdateAdminProfileDto } from '../dto/admin-profile.dto'
import { AdminResponse } from '../responses/admin.response'

@ApiTags('Admin')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/profile')
export class AdminProfileController {
  constructor(private readonly adminProfileService: AdminProfileService) {}

  @ApiOperation({
    summary: 'Create an admin (returns existing if email exists)',
  })
  @ApiResponse({ status: 200, type: AdminResponse })
  @HttpCode(HttpStatus.OK)
  @Post()
  async create(@Body() dto: CreateAdminDto) {
    return toAdminResponse(await this.adminProfileService.create(dto))
  }

  @ApiOperation({ summary: 'Get an admin profile by id' })
  @ApiResponse({ status: 200, type: AdminResponse })
  @Get('/:id')
  async getById(@Param('id') id: string) {
    return toAdminResponse(await this.adminProfileService.getById(id))
  }

  @ApiOperation({ summary: 'Update an admin profile' })
  @ApiResponse({ status: 200, type: AdminResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id')
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    return toAdminResponse(
      await this.adminProfileService.updateProfile(id, dto),
    )
  }
}

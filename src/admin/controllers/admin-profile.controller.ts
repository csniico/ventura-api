import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminProfileService } from '../services/admin-profile.service';
import {
  CreateAdminDto,
  UpdateAdminProfileDto,
} from '../dto/admin-profile.dto';
import { AdminResponse } from '../responses/admin.response';

@ApiTags('Admin')
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
    return this.adminProfileService.create(dto);
  }

  @ApiOperation({ summary: 'Get an admin profile by id' })
  @ApiResponse({ status: 200, type: AdminResponse })
  @Get('/:id')
  async getById(@Param('id') id: string) {
    return this.adminProfileService.getById(id);
  }

  @ApiOperation({ summary: 'Update an admin profile' })
  @ApiResponse({ status: 200, type: AdminResponse })
  @HttpCode(HttpStatus.OK)
  @Patch('/:id')
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    return this.adminProfileService.updateProfile(id, dto);
  }
}

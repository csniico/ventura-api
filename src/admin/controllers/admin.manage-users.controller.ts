import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminManageUsersService } from '../services/admin.manage-users.service';

@ApiTags('Admin')
@Controller('admin/users')
export class AdminManageUsersController {
  constructor(private readonly manageUsers: AdminManageUsersService) {}

  /** List all users (admin-only). */
  @ApiOperation({ summary: 'List all users (admin-only)' })
  @ApiResponse({
    status: 200,
    schema: { type: 'array', items: { type: 'object' } },
  })
  @Get()
  async listUsers() {
    return this.manageUsers.listUsers();
  }

  /** Get a single user by id. */
  @ApiOperation({ summary: 'Get a single user by id' })
  @ApiResponse({ status: 200, schema: { type: 'object' } })
  @Get('/:id')
  async getUserById(@Param('id') id: string) {
    return this.manageUsers.getUserById(id);
  }

  /** Soft-delete a user (sets deleted=true). */
  @ApiOperation({ summary: 'Soft-delete a user (sets deleted=true)' })
  @ApiResponse({ status: 200, schema: { type: 'object' } })
  @HttpCode(HttpStatus.OK)
  @Delete('/:id')
  async softDeleteUser(@Param('id') id: string) {
    return this.manageUsers.softDeleteUser(id);
  }

  /** Restore a soft-deleted user. */
  @ApiOperation({ summary: 'Restore a soft-deleted user' })
  @ApiResponse({ status: 200, schema: { type: 'object' } })
  @HttpCode(HttpStatus.OK)
  @Post('/:id/restore')
  async restoreUser(@Param('id') id: string) {
    return this.manageUsers.restoreUser(id);
  }

  /** Permanently remove a user (admin-only, hard delete). */
  @ApiOperation({ summary: 'Permanently remove a user (hard delete)' })
  @ApiResponse({ status: 200, schema: { type: 'object' } })
  @HttpCode(HttpStatus.OK)
  @Delete('/:id/permanent')
  async hardDeleteUser(@Param('id') id: string) {
    const removed = await this.manageUsers.hardDeleteUser(id);
    if (!removed) {
      throw new NotFoundException('User not found.');
    }
    return removed;
  }
}

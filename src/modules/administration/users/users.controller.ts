import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { AdminUsersService, type InviteAdminDto } from './users.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@ApiTags('Admin - User & Admin Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List platform users' })
  @ApiResponse({ status: 200, description: 'Users list' })
  async getUsers(
    @Query('role') role?: string,
    @Query('q') q?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminUsersService.getUsers({ role, q, page, limit });
  }

  @Post('invite')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Invite/provision a new admin user (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Admin user provisioned' })
  async inviteAdmin(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InviteAdminDto,
  ) {
    return this.adminUsersService.inviteAdmin(req.user.userId, dto);
  }

  @Patch(':id/active')
  @ApiOperation({ summary: 'Suspend or activate a user account' })
  @ApiResponse({ status: 200, description: 'User active status updated' })
  async toggleActive(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.adminUsersService.toggleUserActive(req.user.userId, id, Boolean(isActive));
  }
}

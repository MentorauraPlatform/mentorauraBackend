import {
  Controller,
  Get,
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
import {
  AdminMentorsService,
  type QueryMentorApplicationsDto,
  type RejectMentorDto,
} from './mentors.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
  ip?: string;
}

@ApiTags('Admin - Mentor Vetting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/mentor-applications', version: '1' })
export class AdminMentorsController {
  constructor(private readonly adminMentorsService: AdminMentorsService) {}

  @Get()
  @ApiOperation({ summary: 'List mentor applications for admin review' })
  @ApiResponse({ status: 200, description: 'Mentor applications list' })
  async getApplications(@Query() query: QueryMentorApplicationsDto) {
    return this.adminMentorsService.getMentorApplications(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single mentor application onboarding detail' })
  @ApiResponse({ status: 200, description: 'Mentor application details' })
  async getApplicationDetail(@Param('id') id: string) {
    return this.adminMentorsService.getMentorApplicationDetail(id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve mentor application & publish to marketplace' })
  @ApiResponse({ status: 200, description: 'Mentor application approved' })
  async approveApplication(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.adminMentorsService.approveMentorApplication(
      req.user.userId,
      id,
      req.ip,
    );
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject mentor application with reason' })
  @ApiResponse({ status: 200, description: 'Mentor application rejected' })
  async rejectApplication(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RejectMentorDto,
  ) {
    return this.adminMentorsService.rejectMentorApplication(
      req.user.userId,
      id,
      dto,
      req.ip,
    );
  }
}

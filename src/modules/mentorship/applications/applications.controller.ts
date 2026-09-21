import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/decorators/roles.decorator';
import { CreateMentorshipApplicationDto } from './dto/create-application.dto';

@ApiTags('Mentorship Applications')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('mentorships/apply')
  @Roles(Role.MENTEE)
  @ApiOperation({ summary: 'Apply to a mentorship plan' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 201, description: 'Application submitted' })
  @ApiResponse({ status: 400, description: 'Invalid application' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  applyToPlan(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateMentorshipApplicationDto,
  ) {
    return this.applicationsService.applyToPlan(user.userId, dto);
  }

  @Get('mentorships/applications/mine')
  @Roles(Role.MENTEE)
  @ApiOperation({ summary: 'Get current mentee applications' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Applications retrieved' })
  getMyApplications(@CurrentUser() user: CurrentUserPayload) {
    return this.applicationsService.getMyApplications(user.userId);
  }

  @Get(['mentor/applications', 'mentorships/mentor/applications'])
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Get applications received by mentor' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Applications retrieved' })
  getMentorApplications(@CurrentUser() user: CurrentUserPayload) {
    return this.applicationsService.getMentorApplications(user.userId);
  }

  @Patch('mentorships/applications/:id/accept')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Accept an application' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Application accepted' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  acceptApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.applicationsService.acceptApplication(user.userId, id);
  }

  @Patch('mentorships/applications/:id/reject')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Reject an application' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Application rejected' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  rejectApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.applicationsService.rejectApplication(user.userId, id);
  }

  @Delete('mentorships/applications/:id')
  @Roles(Role.MENTEE)
  @ApiOperation({ summary: 'Withdraw an application' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Application withdrawn' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  withdrawApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.applicationsService.withdrawApplication(user.userId, id);
  }
}

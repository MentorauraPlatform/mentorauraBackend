import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LifecycleService } from './lifecycle.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/decorators/roles.decorator';
/* DTOs for mentorship actions are intentionally omitted when not used */

@ApiTags('Mentorship Lifecycle')
@Controller({ path: 'mentorships', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class LifecycleController {
  constructor(private readonly lifecycleService: LifecycleService) {}

  @Get('mine')
  @Roles(Role.MENTEE)
  @ApiOperation({ summary: 'List mentorships for current mentee' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorships retrieved' })
  getMenteeMentorships(@CurrentUser() user: CurrentUserPayload) {
    return this.lifecycleService.getMenteeMentorships(user.userId);
  }

  @Get('mentor/mentorships')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'List mentorships for current mentor' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorships retrieved' })
  getMentorMentorships(@CurrentUser() user: CurrentUserPayload) {
    return this.lifecycleService.getMentorMentorships(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get mentorship detail' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship detail retrieved' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  getMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.lifecycleService.getMentorship(id, user.userId, role);
  }

  @Patch(':id/activate')
  @Roles(Role.MENTOR, Role.MENTEE)
  @ApiOperation({ summary: 'Activate mentorship after payment' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship activated' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  activateMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.lifecycleService.activateMentorship(id, user.userId, role);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark mentorship as completed' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship completed' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  completeMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.lifecycleService.completeMentorship(id, user.userId, role);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel mentorship' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship cancelled' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  cancelMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.lifecycleService.cancelMentorship(id, user.userId, role);
  }

  @Patch(':id/pause')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Pause mentorship' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship paused' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  pauseMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.lifecycleService.pauseMentorship(id, user.userId);
  }

  @Post(':id/resume')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Resume paused mentorship' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship resumed' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  resumeMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.lifecycleService.resumeMentorship(id, user.userId);
  }
}

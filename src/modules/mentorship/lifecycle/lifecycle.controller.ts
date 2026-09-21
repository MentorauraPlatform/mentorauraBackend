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
import {
  ActivateMentorshipDto,
  CancelMentorshipDto,
  CompleteMentorshipDto,
  PauseMentorshipDto,
} from './dto/mentorship-actions.dto';

@ApiTags('Mentorship Lifecycle')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class LifecycleController {
  constructor(private readonly lifecycleService: LifecycleService) {}

  @Get('mentorships/mine')
  @Roles(Role.MENTEE)
  @ApiOperation({ summary: 'List mentorships for current mentee' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorships retrieved' })
  getMenteeMentorships(@CurrentUser() user: CurrentUserPayload) {
    return this.lifecycleService.getMenteeMentorships(user.userId);
  }

  @Get(['mentor/mentorships', 'mentorships/mentor/mentorships'])
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'List mentorships for current mentor' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorships retrieved' })
  getMentorMentorships(@CurrentUser() user: CurrentUserPayload) {
    return this.lifecycleService.getMentorMentorships(user.userId);
  }

  @Get('mentorships/:id')
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

  @Patch('mentorships/:id/activate')
  @Roles(Role.MENTOR, Role.MENTEE)
  @ApiOperation({ summary: 'Activate mentorship after payment' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship activated' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  activateMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() _dto?: ActivateMentorshipDto,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.lifecycleService.activateMentorship(id, user.userId, role);
  }

  @Patch('mentorships/:id/complete')
  @ApiOperation({ summary: 'Mark mentorship as completed' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship completed' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  completeMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() _dto?: CompleteMentorshipDto,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.lifecycleService.completeMentorship(id, user.userId, role);
  }

  @Patch('mentorships/:id/cancel')
  @ApiOperation({ summary: 'Cancel mentorship with reason' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship cancelled' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  cancelMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto?: CancelMentorshipDto,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.lifecycleService.cancelMentorship(
      id,
      user.userId,
      role,
      dto?.reason,
    );
  }

  @Patch('mentorships/:id/pause')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Pause mentorship' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship paused' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  pauseMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() _dto?: PauseMentorshipDto,
  ) {
    return this.lifecycleService.pauseMentorship(id, user.userId);
  }

  @Post('mentorships/:id/resume')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Resume paused mentorship' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship resumed' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  resumeMentorshipPost(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.lifecycleService.resumeMentorship(id, user.userId);
  }

  @Patch('mentorships/:id/resume')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Resume paused mentorship' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentorship resumed' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  resumeMentorshipPatch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.lifecycleService.resumeMentorship(id, user.userId);
  }
}

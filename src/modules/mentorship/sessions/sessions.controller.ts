import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

@ApiTags('Mentorship Sessions')
@Controller({ path: 'mentorships', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get(':id/sessions')
  @ApiOperation({ summary: 'List sessions for a mentorship' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Sessions retrieved' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  findSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    return this.sessionsService.findForMentorship(id, user.userId, role);
  }
}

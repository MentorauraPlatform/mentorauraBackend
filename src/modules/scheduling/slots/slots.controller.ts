import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SlotsService } from './slots.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/decorators/roles.decorator';

@ApiTags('Scheduling Slots')
@Controller({ path: 'mentors', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get(':mentorId/slots')
  @Roles(Role.MENTEE, Role.MENTOR)
  @ApiOperation({ summary: 'Get available slots for a mentor within a date range' })
  @ApiBearerAuth('access-token')
  @ApiQuery({ name: 'from', required: true, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: true, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'timezone', required: true, description: 'Target timezone, e.g. Africa/Douala' })
  @ApiResponse({ status: 200, description: 'Available slots retrieved' })
  @ApiResponse({ status: 400, description: 'Invalid date range' })
  @ApiResponse({ status: 404, description: 'Mentor not found' })
  getSlots(
    @CurrentUser() user: CurrentUserPayload,
    @Param('mentorId') mentorId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timezone') timezone: string,
  ) {
    return this.slotsService.generateSlots(mentorId, from, to, timezone);
  }
}

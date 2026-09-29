import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { BlackoutDatesService } from './blackouts.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/decorators/roles.decorator';

@ApiTags('Scheduling Blackouts')
@Controller({ path: 'mentor/blackouts', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlackoutsController {
  constructor(private readonly blackoutDatesService: BlackoutDatesService) {}

  @Get()
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'List mentor blackout dates' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Blackout dates retrieved' })
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.blackoutDatesService.list(user.userId);
  }

  @Post()
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Create mentor blackout date' })
  @ApiBearerAuth('access-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date' },
        reason: { type: 'string' },
      },
      required: ['date'],
    },
  })
  @ApiResponse({ status: 201, description: 'Blackout date created' })
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: { date: string; reason?: string }) {
    return this.blackoutDatesService.create(user.userId, body.date, body.reason);
  }

  @Delete(':id')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Delete mentor blackout date' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Blackout date deleted' })
  @ApiResponse({ status: 404, description: 'Blackout date not found' })
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.blackoutDatesService.remove(user.userId, id);
  }
}

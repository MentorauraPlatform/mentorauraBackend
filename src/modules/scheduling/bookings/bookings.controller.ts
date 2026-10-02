import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/decorators/roles.decorator';

@ApiTags('Scheduling Bookings')
@Controller({ path: 'bookings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(Role.MENTEE)
  @ApiOperation({ summary: 'Book a session slot' })
  @ApiBearerAuth('access-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mentorshipId: { type: 'string' },
        scheduledAt: { type: 'string', format: 'date-time' },
        durationMinutes: { type: 'number' },
      },
      required: ['mentorshipId', 'scheduledAt'],
    },
  })
  @ApiResponse({ status: 201, description: 'Booking created' })
  @ApiResponse({ status: 400, description: 'Invalid booking' })
  @ApiResponse({ status: 404, description: 'Mentorship not found' })
  @ApiResponse({ status: 409, description: 'Slot already booked' })
  createBooking(@CurrentUser() user: CurrentUserPayload, @Body() body: { mentorshipId: string; scheduledAt: string; durationMinutes?: number }) {
    return this.bookingsService.createBooking(user.userId, body);
  }

  @Get('mine')
  @Roles(Role.MENTEE, Role.MENTOR)
  @ApiOperation({ summary: 'Get current user bookings' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Bookings retrieved' })
  getMyBookings(@CurrentUser() user: CurrentUserPayload) {
    const role = user.role === 'mentor' ? 'mentor' : 'mentee';
    if (role === 'mentor') {
      return this.bookingsService.findMentorBookings(user.userId);
    }
    return this.bookingsService.findMenteeBookings(user.userId);
  }

  @Get(':id')
  @Roles(Role.MENTEE, Role.MENTOR)
  @ApiOperation({ summary: 'Get booking details' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Booking retrieved' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  getBooking(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.bookingsService.findOne(id, user.userId);
  }

  @Patch(':id/cancel')
  @Roles(Role.MENTEE, Role.MENTOR)
  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiBearerAuth('access-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Booking cancelled' })
  @ApiResponse({ status: 400, description: 'Invalid cancellation' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  cancelBooking(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.bookingsService.cancelBooking(id, user.userId, body.reason);
  }
}

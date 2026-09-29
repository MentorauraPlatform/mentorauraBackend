import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/decorators/roles.decorator';

@ApiTags('Scheduling Availability')
@Controller({ path: 'mentor/availability', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Get mentor availability' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Availability retrieved' })
  @ApiResponse({ status: 404, description: 'Mentor not found' })
  getAvailability(@CurrentUser() user: CurrentUserPayload) {
    return this.availabilityService.getAvailability(user.userId);
  }

  @Put()
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Update mentor availability' })
  @ApiBearerAuth('access-token')
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        monday: [{ start: '09:00', end: '12:00' }],
        wednesday: [{ start: '14:00', end: '17:00' }],
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  @ApiResponse({ status: 404, description: 'Mentor not found' })
  updateAvailability(@CurrentUser() user: CurrentUserPayload, @Body() availability: unknown) {
    return this.availabilityService.updateAvailability(user.userId, availability as never);
  }
}

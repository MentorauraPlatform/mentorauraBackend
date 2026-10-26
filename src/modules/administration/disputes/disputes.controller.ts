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
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DisputeStatus, DisputeReason } from '@prisma/client';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import {
  DisputesService,
  CreateDisputeDto,
  ResolveDisputeDto,
} from './disputes.service';

class CreateDisputeBodyDto implements CreateDisputeDto {
  title!: string;
  description!: string;
  reason!: DisputeReason;
  bookingId?: string;
  mentorshipId?: string;
  targetUserId?: string;
}

class ResolveDisputeBodyDto implements ResolveDisputeDto {
  status!: DisputeStatus;
  resolutionNotes!: string;
  refundAmount?: number;
}

@ApiTags('Dispute Resolution Center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1' })
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get('admin/disputes')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List platform disputes with status and reason filters' })
  async getDisputes(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: DisputeStatus,
    @Query('reason') reason?: DisputeReason,
    @Query('search') search?: string,
  ) {
    return this.disputesService.getDisputes({ page, limit, status, reason, search });
  }

  @Get('admin/disputes/stats')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get dispute metrics across the platform' })
  async getDisputeStats() {
    const data = await this.disputesService.getDisputeStats();
    return { data };
  }

  @Get('admin/disputes/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get single dispute ticket details' })
  async getDisputeById(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.disputesService.getDisputeById(id);
    return { data };
  }

  @Patch('admin/disputes/:id/resolve')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resolve a dispute ticket with outcome notes and refund' })
  async resolveDispute(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeBodyDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.disputesService.resolveDispute(admin.userId, id, dto, ip);
  }

  @Post('disputes')
  @ApiOperation({ summary: 'Submit a new dispute ticket (mentee or mentor)' })
  async createDispute(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateDisputeBodyDto,
  ) {
    const data = await this.disputesService.createDispute(user.userId, dto);
    return { data, message: 'Dispute ticket submitted successfully' };
  }
}

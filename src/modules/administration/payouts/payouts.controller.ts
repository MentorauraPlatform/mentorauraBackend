import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AdminPayoutsService } from './payouts.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

class RejectPayoutBodyDto {
  @IsString()
  rejectionReason!: string;
}

class BatchApproveBodyDto {
  @IsArray()
  @IsString({ each: true })
  payoutIds!: string[];
}

export class RequestPayoutBodyDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  provider!: string;

  @IsString()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  accountName?: string;
}

@ApiTags('Admin - Payout Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'admin/payouts', version: '1' })
export class AdminPayoutsController {
  constructor(private readonly payoutsService: AdminPayoutsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List mentor payouts with status filters' })
  async getPayouts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: PayoutStatus,
  ) {
    return this.payoutsService.getPayouts({ page, limit, status });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get aggregated payout metrics and pending volume' })
  async getPayoutStats() {
    const data = await this.payoutsService.getPayoutStats();
    return { data };
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve and release single mentor payout' })
  async approvePayout(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.payoutsService.approvePayout(admin.userId, id, ip);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject mentor payout request with reason' })
  async rejectPayout(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPayoutBodyDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.payoutsService.rejectPayout(
      admin.userId,
      id,
      dto.rejectionReason,
      ip,
    );
  }

  @Post('batch-approve')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Batch release multiple mentor payouts' })
  async batchApprove(
    @CurrentUser() admin: CurrentUserPayload,
    @Body() dto: BatchApproveBodyDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.payoutsService.batchApprove(admin.userId, dto.payoutIds, ip);
  }

  @Get('balance')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Get current mentor available balance and payout limits' })
  async getBalance(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.payoutsService.getMentorBalance(user.userId);
    return { data };
  }

  @Post('request')
  @Roles(Role.MENTOR)
  @ApiOperation({ summary: 'Mentor requests payout withdrawal' })
  async requestPayout(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RequestPayoutBodyDto,
  ) {
    return this.payoutsService.requestPayout(user.userId, dto);
  }
}

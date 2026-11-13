import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { AdminPayoutsService } from '../../administration/payouts/payouts.service';
import { RequestPayoutBodyDto } from '../../administration/payouts/payouts.controller';

@ApiTags('Payouts - Mentor Balance & Withdrawal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'payouts', version: '1' })
export class BalanceController {
  constructor(private readonly payoutsService: AdminPayoutsService) {}

  @Get('balance')
  @Roles(Role.MENTOR)
  @ApiOperation({
    summary: 'Get current mentor available balance and payout limits',
  })
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

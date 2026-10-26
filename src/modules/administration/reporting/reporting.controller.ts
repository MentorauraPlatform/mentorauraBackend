import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { ReportingService } from './reporting.service';

@ApiTags('Admin - Financial Reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/reporting', version: '1' })
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('financial-summary')
  @ApiOperation({ summary: 'Get aggregated financial and revenue reporting metrics' })
  @ApiResponse({ status: 200, description: 'Financial summary' })
  async getFinancialSummary() {
    const data = await this.reportingService.getFinancialSummary();
    return { data };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List platform transactions with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated transactions list' })
  async getTransactions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('provider') provider?: string,
  ) {
    return this.reportingService.getTransactions({
      page,
      limit,
      status,
      provider,
    });
  }
}

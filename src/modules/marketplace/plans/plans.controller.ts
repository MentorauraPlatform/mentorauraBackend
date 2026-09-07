import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PlansService } from './plans.service';

@ApiTags('Plans')
@Controller({ path: 'plans', version: '1' })
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List all active mentorship plans' })
  @ApiResponse({ status: 200, description: 'Plans retrieved' })
  findAll() {
    return this.plansService.findAll();
  }
}

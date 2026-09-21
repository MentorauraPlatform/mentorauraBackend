import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Marketplace - Plans')
@Controller({ version: '1' })
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'List all active mentorship plans' })
  @ApiResponse({ status: 200, description: 'Plans retrieved' })
  findAll() {
    return this.plansService.findAll();
  }

  @Post('mentor/plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a mentorship plan (Mentor only)' })
  @ApiResponse({ status: 201, description: 'Plan created successfully' })
  async createPlan(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePlanDto,
  ) {
    const data = await this.plansService.createPlan(user.userId, dto);
    return { data };
  }

  @Get('mentor/plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List current mentor own plans' })
  @ApiResponse({ status: 200, description: 'Plans retrieved' })
  async getMyPlans(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.plansService.getMentorPlans(user.userId);
    return { data };
  }

  @Patch('mentor/plans/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a mentorship plan' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  async updatePlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    const data = await this.plansService.updatePlan(user.userId, id, dto);
    return { data };
  }

  @Delete('mentor/plans/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deactivate / soft-delete a mentorship plan' })
  @ApiResponse({ status: 200, description: 'Plan deactivated' })
  async deletePlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const data = await this.plansService.deletePlan(user.userId, id);
    return { data };
  }

  @Public()
  @Get('mentors/:slugOrId/plans')
  @ApiOperation({ summary: 'Publicly list active plans for a mentor' })
  @ApiResponse({ status: 200, description: 'Public plans retrieved' })
  async getPublicPlans(@Param('slugOrId') slugOrId: string) {
    const data = await this.plansService.getPublicMentorPlans(slugOrId);
    return { data };
  }
}

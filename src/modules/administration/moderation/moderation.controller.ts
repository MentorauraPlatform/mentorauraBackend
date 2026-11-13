import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ModerationStatus, ModerationTargetType } from '@prisma/client';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  ModerationService,
  CreateReportDto,
  ModerationActionDto,
} from './moderation.service';

class CreateReportBodyDto implements CreateReportDto {
  @IsEnum(ModerationTargetType)
  targetType!: ModerationTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  details?: string;
}

class ModerationActionBodyDto implements ModerationActionDto {
  @IsIn(['DELETE_CONTENT', 'SUSPEND_USER', 'DISMISS', 'WARN_USER'])
  action!: 'DELETE_CONTENT' | 'SUSPEND_USER' | 'DISMISS' | 'WARN_USER';

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Content & Chat Moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1' })
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('admin/moderation/reports')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List flagged content reports with status/type filters',
  })
  async getReports(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: ModerationStatus,
    @Query('targetType') targetType?: ModerationTargetType,
  ) {
    return this.moderationService.getReports({
      page,
      limit,
      status,
      targetType,
    });
  }

  @Get('admin/moderation/stats')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get moderation overview metrics' })
  async getStats() {
    const data = await this.moderationService.getStats();
    return { data };
  }

  @Post('admin/moderation/reports/:id/action')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Apply moderation action (delete content, suspend user, dismiss)',
  })
  async takeAction(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionBodyDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.moderationService.takeAction(admin.userId, id, dto, ip);
  }

  @Post('moderation/reports')
  @ApiOperation({
    summary: 'Submit a flag/report on a message, user profile, or review',
  })
  async reportContent(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateReportBodyDto,
  ) {
    const data = await this.moderationService.createReport(user.userId, dto);
    return {
      data,
      message: 'Report submitted successfully. Our safety team will review it.',
    };
  }
}

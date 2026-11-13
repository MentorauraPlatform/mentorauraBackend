import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { ConfigurationService } from './configuration.service';

class UpdateSettingsBodyDto {
  @IsObject()
  settings!: Record<string, string>;
}

class CreateCategoryBodyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateCategoryBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@ApiTags('Platform System Settings & Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1' })
export class ConfigurationController {
  constructor(private readonly configService: ConfigurationService) {}

  // --- Platform Settings ---

  @Get('admin/configuration')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all global platform settings and policies' })
  async getSettings() {
    const data = await this.configService.getSettings();
    return { data };
  }

  @Put('admin/configuration')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Batch update platform settings (commission, thresholds, policies)',
  })
  async updateSettings(
    @CurrentUser() admin: CurrentUserPayload,
    @Body() dto: UpdateSettingsBodyDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.configService.updateSettings(admin.userId, dto.settings, ip);
  }

  // --- Categories Management ---

  @Get('admin/configuration/categories')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all categories with active mentor counts' })
  async getCategories() {
    const data = await this.configService.getCategories();
    return { data };
  }

  @Post('admin/configuration/categories')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new supported mentor category' })
  async createCategory(
    @CurrentUser() admin: CurrentUserPayload,
    @Body() dto: CreateCategoryBodyDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const data = await this.configService.createCategory(admin.userId, dto, ip);
    return { data, message: 'Category created successfully' };
  }

  @Patch('admin/configuration/categories/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an existing category' })
  async updateCategory(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryBodyDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const data = await this.configService.updateCategory(
      admin.userId,
      id,
      dto,
      ip,
    );
    return { data, message: 'Category updated successfully' };
  }

  @Delete('admin/configuration/categories/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete a category (only if no mentors are assigned)',
  })
  async deleteCategory(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    return this.configService.deleteCategory(admin.userId, id, ip);
  }
}

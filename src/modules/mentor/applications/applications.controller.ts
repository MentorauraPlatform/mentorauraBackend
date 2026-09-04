import {
  Controller,
  Get,
  Patch,
  Post,
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
import { ApplicationsService } from './applications.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/decorators/roles.decorator';
import { CreateMentorApplicationDto } from './dto/create-mentor-application.dto';
import { UpdateMentorProfileDto } from './dto/update-mentor-profile.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

@ApiTags('Mentor Applications')
@Controller({ path: 'mentor/applications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MENTOR)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Public()
  @Get('skills')
  @ApiOperation({ summary: 'List all available skills' })
  @ApiResponse({ status: 200, description: 'Skills retrieved' })
  async findAllSkills() {
    const skills = await this.applicationsService.getAllSkills();
    return { data: skills };
  }

  @Post()
  @ApiOperation({ summary: 'Create mentor profile' })
  @ApiResponse({ status: 201, description: 'Mentor profile created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  createProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateMentorApplicationDto,
  ) {
    return this.applicationsService.createProfile(user.userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current mentor profile' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Mentor profile retrieved' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  getMyProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.applicationsService.getMyProfile(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update mentor profile' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateMentorProfileDto,
  ) {
    return this.applicationsService.updateProfile(user.userId, dto);
  }

  @Post('me/skills')
  @ApiOperation({ summary: 'Add skill to mentor profile' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 201, description: 'Skill added' })
  @ApiResponse({ status: 404, description: 'Profile or skill not found' })
  @ApiResponse({ status: 409, description: 'Skill already added' })
  addSkill(@CurrentUser() user: CurrentUserPayload, @Body() dto: AddSkillDto) {
    return this.applicationsService.addSkill(user.userId, dto);
  }

  @Patch('me/skills/:skillId')
  @ApiOperation({ summary: 'Update skill level' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Skill updated' })
  @ApiResponse({ status: 404, description: 'Profile or skill not found' })
  updateSkill(
    @CurrentUser() user: CurrentUserPayload,
    @Param('skillId') skillId: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.applicationsService.updateSkill(user.userId, skillId, dto);
  }

  @Delete('me/skills/:skillId')
  @ApiOperation({ summary: 'Remove skill' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Skill removed' })
  @ApiResponse({ status: 404, description: 'Profile or skill not found' })
  removeSkill(
    @CurrentUser() user: CurrentUserPayload,
    @Param('skillId') skillId: string,
  ) {
    return this.applicationsService.removeSkill(user.userId, skillId);
  }

  @Patch('me/availability')
  @ApiOperation({ summary: 'Update availability' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Availability updated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  updateAvailability(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.applicationsService.updateAvailability(user.userId, dto);
  }

  @Post('me/submit')
  @ApiOperation({ summary: 'Submit onboarding for review' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Onboarding submitted' })
  @ApiResponse({ status: 400, description: 'Invalid onboarding state' })
  submitOnboarding(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitOnboardingDto,
  ) {
    return this.applicationsService.submitOnboarding(user.userId, dto);
  }
}

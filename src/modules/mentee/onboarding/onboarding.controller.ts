import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { CreateMenteeProfileDto } from './dto/create-mentee-profile.dto';
import { UpdateMenteeProfileDto } from './dto/update-mentee-profile.dto';
import { UpdateInterestsDto } from './dto/update-interests.dto';
import { UpdateGoalsDto } from './dto/update-goals.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

@ApiTags('Mentee Onboarding')
@ApiBearerAuth('access-token')
@Controller({ path: 'mentee/onboarding', version: '1' })
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post()
  @ApiOperation({ summary: 'Create mentee profile' })
  @ApiResponse({ status: 201, description: 'Mentee profile created' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  createProfile(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMenteeProfileDto) {
    return this.onboardingService.createProfile(user.userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current mentee profile' })
  @ApiResponse({ status: 200, description: 'Mentee profile retrieved' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  getMyProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.onboardingService.getMyProfile(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update mentee profile' })
  updateProfile(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateMenteeProfileDto) {
    return this.onboardingService.updateProfile(user.userId, dto);
  }

  @Patch('me/interests')
  @ApiOperation({ summary: 'Update interests' })
  updateInterests(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateInterestsDto) {
    return this.onboardingService.updateInterests(user.userId, dto);
  }

  @Patch('me/goals')
  @ApiOperation({ summary: 'Update mentorship goals' })
  updateGoals(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateGoalsDto) {
    return this.onboardingService.updateGoals(user.userId, dto);
  }

  @Patch('me/experience')
  @ApiOperation({ summary: 'Update experience' })
  updateExperience(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateExperienceDto) {
    return this.onboardingService.updateExperience(user.userId, dto);
  }

  @Patch('me/availability')
  @ApiOperation({ summary: 'Update availability/preferences' })
  updateAvailability(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateAvailabilityDto) {
    return this.onboardingService.updateAvailability(user.userId, dto);
  }

  @Post('me/skills')
  @ApiOperation({ summary: 'Add skill' })
  addSkill(@CurrentUser() user: CurrentUserPayload, @Body() dto: AddSkillDto) {
    return this.onboardingService.addSkill(user.userId, dto);
  }

  @Patch('me/skills/:skillId')
  @ApiOperation({ summary: 'Update skill level' })
  updateSkill(
    @CurrentUser() user: CurrentUserPayload,
    @Param('skillId') skillId: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.onboardingService.updateSkill(user.userId, skillId, dto);
  }

  @Delete('me/skills/:skillId')
  @ApiOperation({ summary: 'Remove skill' })
  removeSkill(@CurrentUser() user: CurrentUserPayload, @Param('skillId') skillId: string) {
    return this.onboardingService.removeSkill(user.userId, skillId);
  }

  @Post('me/submit')
  @ApiOperation({ summary: 'Complete onboarding' })
  submitOnboarding(@CurrentUser() user: CurrentUserPayload, @Body() dto: SubmitOnboardingDto) {
    return this.onboardingService.submitOnboarding(user.userId, dto);
  }
}

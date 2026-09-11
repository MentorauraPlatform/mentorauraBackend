import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateMenteeProfileDto } from './dto/create-mentee-profile.dto';
import { UpdateMenteeProfileDto } from './dto/update-mentee-profile.dto';
import { UpdateInterestsDto } from './dto/update-interests.dto';
import { UpdateGoalsDto } from './dto/update-goals.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private async getProfileOrThrow(userId: string) {
    const profile = await this.prisma.menteeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Mentee profile not found');
    return profile;
  }

  async createProfile(userId: string, dto: CreateMenteeProfileDto) {
    const existing = await this.prisma.menteeProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Mentee profile already exists');

    const profile = await this.prisma.menteeProfile.create({
      data: { userId, fullName: dto.fullName, avatarUrl: dto.avatarUrl, headline: dto.headline },
      include: { skills: true },
    });
    return { data: profile };
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.menteeProfile.findUnique({
      where: { userId },
      include: { skills: true },
    });
    if (!profile) throw new NotFoundException('Mentee profile not found');
    return { data: profile };
  }

  async updateProfile(userId: string, dto: UpdateMenteeProfileDto) {
    await this.getProfileOrThrow(userId);
    const profile = await this.prisma.menteeProfile.update({
      where: { userId },
      data: dto,
      include: { skills: true },
    });
    return { data: profile };
  }

  async updateInterests(userId: string, dto: UpdateInterestsDto) {
    await this.getProfileOrThrow(userId);
    const profile = await this.prisma.menteeProfile.update({
      where: { userId },
      data: { interests: dto.interests },
    });
    return { data: profile };
  }

  async updateGoals(userId: string, dto: UpdateGoalsDto) {
    await this.getProfileOrThrow(userId);
    const profile = await this.prisma.menteeProfile.update({
      where: { userId },
      data: { goals: dto.goals },
    });
    return { data: profile };
  }

  async updateExperience(userId: string, dto: UpdateExperienceDto) {
    await this.getProfileOrThrow(userId);
    const profile = await this.prisma.menteeProfile.update({
      where: { userId },
      data: dto,
    });
    return { data: profile };
  }

  async updateAvailability(userId: string, dto: UpdateAvailabilityDto) {
    await this.getProfileOrThrow(userId);
    const profile = await this.prisma.menteeProfile.update({
      where: { userId },
      data: { availability: JSON.parse(JSON.stringify(dto.availability)) },
    });
    return { data: profile };
  }

  async addSkill(userId: string, dto: AddSkillDto) {
    const profile = await this.getProfileOrThrow(userId);

    const existing = await this.prisma.skill.findFirst({
      where: { menteeProfileId: profile.id, name: dto.name },
    });
    if (existing) throw new ConflictException('Skill already added');

    const skill = await this.prisma.skill.create({
      data: { name: dto.name, level: dto.level, menteeProfileId: profile.id },
    });
    return { data: skill };
  }

  async updateSkill(userId: string, skillId: string, dto: UpdateSkillDto) {
    const profile = await this.getProfileOrThrow(userId);

    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, menteeProfileId: profile.id },
    });
    if (!skill) throw new NotFoundException('Skill not found on profile');

    const updated = await this.prisma.skill.update({
      where: { id: skillId },
      data: { level: dto.level },
    });
    return { data: updated };
  }

  async removeSkill(userId: string, skillId: string) {
    const profile = await this.getProfileOrThrow(userId);

    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, menteeProfileId: profile.id },
    });
    if (!skill) throw new NotFoundException('Skill not found on profile');

    await this.prisma.skill.delete({ where: { id: skillId } });
    return { message: 'Skill removed successfully' };
  }

  async submitOnboarding(userId: string, dto: SubmitOnboardingDto) {
    const profile = await this.getProfileOrThrow(userId);

    if (profile.onboardingCompleted) {
      throw new BadRequestException('Onboarding already complete');
    }
    if (!dto.confirmed) {
      throw new BadRequestException('You must confirm before submitting');
    }

    const updated = await this.prisma.menteeProfile.update({
      where: { userId },
      data: { onboardingCompleted: true },
    });
    return { data: updated, message: 'Onboarding completed successfully' };
  }
}

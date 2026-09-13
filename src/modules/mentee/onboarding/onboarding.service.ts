import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SkillLevel } from '@prisma/client';
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
      include: { user: { include: { userSkills: { include: { skill: true } } } } },
    });
    return { data: profile };
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.menteeProfile.findUnique({
      where: { userId },
      include: { user: { include: { userSkills: { include: { skill: true } } } } },
    });
    if (!profile) throw new NotFoundException('Mentee profile not found');
    return { data: profile };
  }

  async updateProfile(userId: string, dto: UpdateMenteeProfileDto) {
    await this.getProfileOrThrow(userId);
    const profile = await this.prisma.menteeProfile.update({
      where: { userId },
      data: dto,
      include: { user: { include: { userSkills: { include: { skill: true } } } } },
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
    await this.getProfileOrThrow(userId);

    let skill = await this.prisma.skill.findUnique({
      where: { name: dto.name },
    });

    if (!skill) {
      skill = await this.prisma.skill.create({
        data: { name: dto.name },
      });
    }

    const existing = await this.prisma.userSkill.findFirst({
      where: { userId, skillId: skill.id },
    });
    if (existing) throw new ConflictException('Skill already added');

    const userSkill = await this.prisma.userSkill.create({
      data: {
        userId,
        skillId: skill.id,
        level: dto.level || SkillLevel.BEGINNER,
      },
      include: { skill: true },
    });
    return { data: userSkill };
  }

  async updateSkill(userId: string, skillId: string, dto: UpdateSkillDto) {
    await this.getProfileOrThrow(userId);

    const userSkill = await this.prisma.userSkill.findFirst({
      where: { userId, skillId },
    });
    if (!userSkill) throw new NotFoundException('Skill not found on profile');

    const updated = await this.prisma.userSkill.update({
      where: { id: userSkill.id },
      data: { level: dto.level },
      include: { skill: true },
    });
    return { data: updated };
  }

  async removeSkill(userId: string, skillId: string) {
    await this.getProfileOrThrow(userId);

    const userSkill = await this.prisma.userSkill.findFirst({
      where: { userId, skillId },
    });
    if (!userSkill) throw new NotFoundException('Skill not found on profile');

    await this.prisma.userSkill.delete({ where: { id: userSkill.id } });
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

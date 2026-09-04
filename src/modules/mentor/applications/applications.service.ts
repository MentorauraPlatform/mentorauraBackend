import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  CacheKey,
  CacheTTL,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateMentorApplicationDto } from './dto/create-mentor-application.dto';
import { UpdateMentorProfileDto } from './dto/update-mentor-profile.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import { SkillLevel } from '@prisma/client';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProfile(userId: string, dto: CreateMentorApplicationDto) {
    const existing = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException('Mentor profile already exists');
    }

    const profile = await this.prisma.mentorProfile.create({
      data: {
        userId,
        fullName: dto.fullName,
        title: dto.title,
        company: dto.company,
        bio: dto.bio,
        experience: dto.experience,
        areasOfExpertise: dto.areasOfExpertise ?? [],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isMentor: true,
            isActive: true,
            userSkills: {
              include: {
                skill: true,
              },
            },
          },
        },
      },
    });

    return { data: profile };
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isMentor: true,
            isActive: true,
            userSkills: {
              include: {
                skill: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    return { data: profile };
  }

  async updateProfile(userId: string, dto: UpdateMentorProfileDto) {
    const existing = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      throw new NotFoundException('Mentor profile not found');
    }

    const profile = await this.prisma.mentorProfile.update({
      where: { userId },
      data: {
        fullName: dto.fullName,
        title: dto.title,
        company: dto.company,
        bio: dto.bio,
        experience: dto.experience,
        areasOfExpertise: dto.areasOfExpertise,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isMentor: true,
            isActive: true,
            userSkills: {
              include: {
                skill: true,
              },
            },
          },
        },
      },
    });

    return { data: profile };
  }

  async addSkill(userId: string, dto: AddSkillDto) {
    const profile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const skill = await this.prisma.skill.findUnique({
      where: { id: dto.skillId },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const existing = await this.prisma.userSkill.findFirst({
      where: {
        userId,
        skillId: dto.skillId,
      },
    });

    if (existing) {
      throw new ConflictException('Skill already added to profile');
    }

    // validate level
    if (!Object.values(SkillLevel).includes(dto.level)) {
      throw new BadRequestException('Invalid skill level');
    }

    const userSkill = await this.prisma.userSkill.create({
      data: {
        userId,
        skillId: dto.skillId,
        level: dto.level,
      },
      include: {
        skill: true,
      },
    });

    return { data: userSkill };
  }

  async updateSkill(userId: string, skillId: string, dto: UpdateSkillDto) {
    const profile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const userSkill = await this.prisma.userSkill.findFirst({
      where: {
        userId,
        skillId,
      },
    });

    if (!userSkill) {
      throw new NotFoundException('Skill not found on profile');
    }

    const updated = await this.prisma.userSkill.update({
      where: { id: userSkill.id },
      data: {
        level: dto.level,
      },
      include: {
        skill: true,
      },
    });

    return { data: updated };
  }

  async removeSkill(userId: string, skillId: string) {
    const profile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const userSkill = await this.prisma.userSkill.findFirst({
      where: {
        userId,
        skillId,
      },
    });

    if (!userSkill) {
      throw new NotFoundException('Skill not found on profile');
    }

    await this.prisma.userSkill.delete({
      where: { id: userSkill.id },
    });

    return { message: 'Skill removed successfully' };
  }

  async updateAvailability(userId: string, dto: UpdateAvailabilityDto) {
    const profile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const updated = await this.prisma.mentorProfile.update({
      where: { userId },
      data: {
        availability: dto.availability,
      },
    });

    return { data: updated };
  }

  async submitOnboarding(userId: string, dto: SubmitOnboardingDto) {
    const profile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    if (profile.onboardingStatus === 'PENDING') {
      throw new BadRequestException('Onboarding already submitted');
    }

    if (profile.onboardingStatus === 'COMPLETE') {
      throw new BadRequestException('Onboarding already complete');
    }

    if (!dto.confirmed) {
      throw new BadRequestException('You must confirm before submitting');
    }

    const updated = await this.prisma.mentorProfile.update({
      where: { userId },
      data: {
        onboardingStatus: 'PENDING',
      },
    });

    return { data: updated, message: 'Onboarding submitted successfully' };
  }

  @CacheKey('skills:all')
  @CacheTTL(3600)
  async getAllSkills() {
    const skills = await this.prisma.skill.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    return skills;
  }
}

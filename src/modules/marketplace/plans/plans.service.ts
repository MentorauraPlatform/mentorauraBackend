import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  private serializePlan(plan: Plan) {
    return {
      ...plan,
      priceAmount: Number(plan.priceAmount),
    };
  }

  async createPlan(userId: string, dto: CreatePlanDto) {
    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const plan = await this.prisma.plan.create({
      data: {
        mentorId: mentorProfile.id,
        title: dto.title,
        description: dto.description,
        priceAmount: BigInt(dto.priceAmount),
        currency: dto.currency,
        sessionsPerMonth: dto.sessionsPerMonth ?? 1,
        isActive: true,
      },
    });

    return this.serializePlan(plan);
  }

  async getMentorPlans(userId: string) {
    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const plans = await this.prisma.plan.findMany({
      where: { mentorId: mentorProfile.id },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map((p) => this.serializePlan(p));
  }

  async updatePlan(userId: string, planId: string, dto: UpdatePlanDto) {
    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.mentorId !== mentorProfile.id) {
      throw new ForbiddenException('You can only update your own plans');
    }

    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priceAmount !== undefined && {
          priceAmount: BigInt(dto.priceAmount),
        }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.sessionsPerMonth !== undefined && {
          sessionsPerMonth: dto.sessionsPerMonth,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return this.serializePlan(updated);
  }

  async deletePlan(userId: string, planId: string) {
    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.mentorId !== mentorProfile.id) {
      throw new ForbiddenException('You can only delete your own plans');
    }

    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: { isActive: false },
    });

    return this.serializePlan(updated);
  }

  async getPublicMentorPlans(slugOrId: string) {
    const mentorProfile = await this.prisma.mentorProfile.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
      },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor not found');
    }

    const plans = await this.prisma.plan.findMany({
      where: {
        mentorId: mentorProfile.id,
        isActive: true,
      },
      orderBy: { priceAmount: 'asc' },
    });

    return plans.map((p) => this.serializePlan(p));
  }
}

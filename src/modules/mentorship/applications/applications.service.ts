import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateMentorshipApplicationDto } from './dto/create-application.dto';
import {
  MentorshipApplication,
  MentorshipApplicationStatus,
} from '@prisma/client';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async applyToPlan(menteeId: string, dto: CreateMentorshipApplicationDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
      include: { mentor: true },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (!plan.isActive) {
      throw new BadRequestException('Plan is not active');
    }

    if (
      !plan.mentor ||
      !plan.mentor.isVerified ||
      plan.mentor.onboardingStatus !== 'COMPLETE'
    ) {
      throw new BadRequestException('Mentor is not available for applications');
    }

    const existing: MentorshipApplication | null =
      await this.prisma.mentorshipApplication.findFirst({
        where: {
          menteeId,
          mentorId: plan.mentorId,
          planId: dto.planId,
          status: MentorshipApplicationStatus.PENDING,
        },
      });

    if (existing) {
      throw new ConflictException(
        'You already have a pending application for this plan',
      );
    }

    const application = await this.prisma.mentorshipApplication.create({
      data: {
        menteeId,
        mentorId: plan.mentorId,
        planId: dto.planId,
        message: dto.message,
      },
      include: {
        mentee: { select: { id: true, email: true } },
        mentor: { select: { id: true, fullName: true } },
        plan: {
          select: { id: true, title: true, priceAmount: true, currency: true },
        },
      },
    });

    return { data: application };
  }

  async getMyApplications(menteeId: string) {
    const applications = await this.prisma.mentorshipApplication.findMany({
      where: { menteeId },
      include: {
        mentor: {
          select: { id: true, fullName: true, title: true, company: true },
        },
        plan: {
          select: { id: true, title: true, priceAmount: true, currency: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: applications };
  }

  async getMentorApplications(mentorId: string) {
    const applications = await this.prisma.mentorshipApplication.findMany({
      where: { mentorId },
      include: {
        mentee: { select: { id: true, email: true } },
        plan: {
          select: { id: true, title: true, priceAmount: true, currency: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: applications };
  }

  async acceptApplication(mentorId: string, applicationId: string) {
    const application = await this.prisma.mentorshipApplication.findUnique({
      where: { id: applicationId },
      include: { plan: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.mentorId !== mentorId) {
      throw new ForbiddenException(
        'You are not authorized to accept this application',
      );
    }

    if (application.status !== MentorshipApplicationStatus.PENDING) {
      throw new BadRequestException('Application is not in pending status');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const accepted = await tx.mentorshipApplication.update({
        where: { id: applicationId },
        data: { status: MentorshipApplicationStatus.ACCEPTED },
      });

      await tx.mentorship.create({
        data: {
          menteeId: application.menteeId,
          mentorId: application.mentorId,
          planId: application.planId,
          status: 'INTRO',
        },
      });

      return accepted;
    });

    return { data: updated };
  }

  async rejectApplication(mentorId: string, applicationId: string) {
    const application = await this.prisma.mentorshipApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.mentorId !== mentorId) {
      throw new ForbiddenException(
        'You are not authorized to reject this application',
      );
    }

    if (application.status !== MentorshipApplicationStatus.PENDING) {
      throw new BadRequestException('Application is not in pending status');
    }

    const updated = await this.prisma.mentorshipApplication.update({
      where: { id: applicationId },
      data: { status: MentorshipApplicationStatus.REJECTED },
    });

    return { data: updated };
  }

  async withdrawApplication(menteeId: string, applicationId: string) {
    const application = await this.prisma.mentorshipApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.menteeId !== menteeId) {
      throw new ForbiddenException(
        'You are not authorized to withdraw this application',
      );
    }

    if (application.status !== MentorshipApplicationStatus.PENDING) {
      throw new BadRequestException('Application is not in pending status');
    }

    const updated = await this.prisma.mentorshipApplication.update({
      where: { id: applicationId },
      data: { status: MentorshipApplicationStatus.WITHDRAWN },
    });

    return { data: updated };
  }
}

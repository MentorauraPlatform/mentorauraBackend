import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateMentorshipApplicationDto } from './dto/create-application.dto';
import {
  MentorshipApplication,
  MentorshipApplicationStatus,
} from '@prisma/client';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async getMentorProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.mentorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }
    return profile.id;
  }

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

    this.eventEmitter.emit('mentorship.application.submitted', {
      applicationId: application.id,
      menteeId,
      mentorId: plan.mentorId,
      planId: dto.planId,
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

  async getMentorApplications(userId: string) {
    const mentorProfileId = await this.getMentorProfileId(userId);

    const applications = await this.prisma.mentorshipApplication.findMany({
      where: { mentorId: mentorProfileId },
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

  async acceptApplication(userId: string, applicationId: string) {
    const mentorProfileId = await this.getMentorProfileId(userId);

    const application = await this.prisma.mentorshipApplication.findUnique({
      where: { id: applicationId },
      include: { plan: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.mentorId !== mentorProfileId) {
      throw new ForbiddenException(
        'You are not authorized to accept this application',
      );
    }

    if (application.status !== MentorshipApplicationStatus.PENDING) {
      throw new BadRequestException('Application is not in pending status');
    }

    const { accepted, mentorship } = await this.prisma.$transaction(
      async (tx) => {
        const acceptedApp = await tx.mentorshipApplication.update({
          where: { id: applicationId },
          data: { status: MentorshipApplicationStatus.ACCEPTED },
        });

        const newMentorship = await tx.mentorship.create({
          data: {
            menteeId: application.menteeId,
            mentorId: application.mentorId,
            planId: application.planId,
            status: 'INTRO',
          },
        });

        return { accepted: acceptedApp, mentorship: newMentorship };
      },
    );

    this.eventEmitter.emit('mentorship.application.accepted', {
      applicationId: accepted.id,
      mentorshipId: mentorship.id,
      menteeId: application.menteeId,
      mentorId: application.mentorId,
      planId: application.planId,
    });

    return { data: accepted };
  }

  async rejectApplication(userId: string, applicationId: string) {
    const mentorProfileId = await this.getMentorProfileId(userId);

    const application = await this.prisma.mentorshipApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.mentorId !== mentorProfileId) {
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

    this.eventEmitter.emit('mentorship.application.rejected', {
      applicationId: updated.id,
      menteeId: application.menteeId,
      mentorId: application.mentorId,
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

    this.eventEmitter.emit('mentorship.application.withdrawn', {
      applicationId: updated.id,
      menteeId,
    });

    return { data: updated };
  }
}

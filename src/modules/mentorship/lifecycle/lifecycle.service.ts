import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {} from /* MentorshipStatus */ '@prisma/client';

type MentorshipRole = 'mentee' | 'mentor';

@Injectable()
export class LifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async getMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
  ) {
    const where =
      role === 'mentee'
        ? { id: mentorshipId, menteeId: userId }
        : { id: mentorshipId, mentorId: userId };

    const mentorship = await this.prisma.mentorship.findFirst({
      where,
      include: {
        mentee: { select: { id: true, email: true } },
        mentor: { select: { id: true, fullName: true, title: true } },
        plan: {
          select: { id: true, title: true, priceAmount: true, currency: true },
        },
      },
    });

    if (!mentorship) {
      throw new NotFoundException('Mentorship not found');
    }

    if (role === 'mentee' && mentorship.menteeId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view this mentorship',
      );
    }

    if (role === 'mentor' && mentorship.mentorId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view this mentorship',
      );
    }

    return mentorship;
  }

  async getMenteeMentorships(menteeId: string) {
    const mentorships = await this.prisma.mentorship.findMany({
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

    return { data: mentorships };
  }

  async getMentorMentorships(mentorId: string) {
    const mentorships = await this.prisma.mentorship.findMany({
      where: { mentorId },
      include: {
        mentee: { select: { id: true, email: true } },
        plan: {
          select: { id: true, title: true, priceAmount: true, currency: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: mentorships };
  }

  async activateMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
  ) {
    const mentorship = await this.getMentorship(mentorshipId, userId, role);

    if (mentorship.status !== 'INTRO') {
      throw new BadRequestException('Only INTRO mentorships can be activated');
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });

    return { data: updated };
  }

  async completeMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
  ) {
    const mentorship = await this.getMentorship(mentorshipId, userId, role);

    if (mentorship.status !== 'ACTIVE' && mentorship.status !== 'PAUSED') {
      throw new BadRequestException(
        'Only ACTIVE or PAUSED mentorships can be completed',
      );
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
      },
    });

    return { data: updated };
  }

  async cancelMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
  ) {
    const mentorship = await this.getMentorship(mentorshipId, userId, role);

    if (
      mentorship.status !== 'INTRO' &&
      mentorship.status !== 'ACTIVE' &&
      mentorship.status !== 'PAUSED'
    ) {
      throw new BadRequestException(
        'This mentorship cannot be cancelled from its current state',
      );
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: {
        status: 'CANCELLED',
        endedAt: new Date(),
      },
    });

    return { data: updated };
  }

  async pauseMentorship(mentorshipId: string, userId: string) {
    const mentorship = await this.getMentorship(mentorshipId, userId, 'mentor');

    if (mentorship.status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE mentorships can be paused');
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: { status: 'PAUSED' },
    });

    return { data: updated };
  }

  async resumeMentorship(mentorshipId: string, userId: string) {
    const mentorship = await this.getMentorship(mentorshipId, userId, 'mentor');

    if (mentorship.status !== 'PAUSED') {
      throw new BadRequestException('Only PAUSED mentorships can be resumed');
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: { status: 'ACTIVE' },
    });

    return { data: updated };
  }
}

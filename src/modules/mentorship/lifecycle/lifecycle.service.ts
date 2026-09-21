import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';

type MentorshipRole = 'mentee' | 'mentor';

@Injectable()
export class LifecycleService {
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

  async getMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
  ) {
    let whereCondition: { id: string; menteeId?: string; mentorId?: string };

    if (role === 'mentee') {
      whereCondition = { id: mentorshipId, menteeId: userId };
    } else {
      const mentorProfileId = await this.getMentorProfileId(userId);
      whereCondition = { id: mentorshipId, mentorId: mentorProfileId };
    }

    const mentorship = await this.prisma.mentorship.findFirst({
      where: whereCondition,
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

  async getMentorMentorships(userId: string) {
    const mentorProfileId = await this.getMentorProfileId(userId);

    const mentorships = await this.prisma.mentorship.findMany({
      where: { mentorId: mentorProfileId },
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
      throw new BadRequestException(
        `Cannot activate mentorship with status '${mentorship.status}'. Only INTRO mentorships can be activated.`,
      );
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });

    this.eventEmitter.emit('mentorship.activated', {
      mentorshipId: updated.id,
      menteeId: updated.menteeId,
      mentorId: updated.mentorId,
    });

    return { data: updated };
  }

  async completeMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
  ) {
    const mentorship = await this.getMentorship(mentorshipId, userId, role);

    if (mentorship.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot complete mentorship with status '${mentorship.status}'. Only ACTIVE mentorships can be completed.`,
      );
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
      },
    });

    this.eventEmitter.emit('mentorship.completed', {
      mentorshipId: updated.id,
      menteeId: updated.menteeId,
      mentorId: updated.mentorId,
    });

    return { data: updated };
  }

  async cancelMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
    reason?: string,
  ) {
    const mentorship = await this.getMentorship(mentorshipId, userId, role);

    if (
      mentorship.status !== 'INTRO' &&
      mentorship.status !== 'ACTIVE' &&
      mentorship.status !== 'PAUSED'
    ) {
      throw new BadRequestException(
        `This mentorship cannot be cancelled from its current state '${mentorship.status}'.`,
      );
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason ?? null,
        endedAt: new Date(),
      },
    });

    this.eventEmitter.emit('mentorship.cancelled', {
      mentorshipId: updated.id,
      menteeId: updated.menteeId,
      mentorId: updated.mentorId,
      reason,
      cancelledBy: role,
    });

    return { data: updated };
  }

  async pauseMentorship(mentorshipId: string, userId: string) {
    const mentorship = await this.getMentorship(mentorshipId, userId, 'mentor');

    if (mentorship.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot pause mentorship with status '${mentorship.status}'. Only ACTIVE mentorships can be paused.`,
      );
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: { status: 'PAUSED' },
    });

    this.eventEmitter.emit('mentorship.paused', {
      mentorshipId: updated.id,
      mentorId: updated.mentorId,
    });

    return { data: updated };
  }

  async resumeMentorship(mentorshipId: string, userId: string) {
    const mentorship = await this.getMentorship(mentorshipId, userId, 'mentor');

    if (mentorship.status !== 'PAUSED') {
      throw new BadRequestException(
        `Cannot resume mentorship with status '${mentorship.status}'. Only PAUSED mentorships can be resumed.`,
      );
    }

    const updated = await this.prisma.mentorship.update({
      where: { id: mentorshipId },
      data: { status: 'ACTIVE' },
    });

    this.eventEmitter.emit('mentorship.resumed', {
      mentorshipId: updated.id,
      mentorId: updated.mentorId,
    });

    return { data: updated };
  }
}

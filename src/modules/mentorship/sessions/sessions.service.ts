import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

type MentorshipRole = 'mentee' | 'mentor';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findForMentorship(
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
      select: { id: true },
    });

    if (!mentorship) {
      throw new NotFoundException('Mentorship not found');
    }

    const sessions = await this.prisma.session.findMany({
      where: { mentorshipId },
      orderBy: { scheduledAt: 'desc' },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
        meetingLink: true,
        createdAt: true,
      },
    });

    return { data: sessions };
  }
}

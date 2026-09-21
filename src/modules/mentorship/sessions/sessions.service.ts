import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

type MentorshipRole = 'mentee' | 'mentor';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findForMentorship(
    mentorshipId: string,
    userId: string,
    role: MentorshipRole,
  ) {
    let where: { id: string; menteeId?: string; mentorId?: string };

    if (role === 'mentee') {
      where = { id: mentorshipId, menteeId: userId };
    } else {
      const mentorProfileId = await this.getMentorProfileId(userId);
      where = { id: mentorshipId, mentorId: mentorProfileId };
    }

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

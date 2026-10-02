import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeaturedMentors() {
    const mentors = await this.prisma.mentorProfile.findMany({
      where: {
        isVerified: true,
        onboardingStatus: 'COMPLETE',
      },
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            userSkills: {
              include: {
                skill: true,
              },
            },
          },
        },
        plans: {
          where: { isActive: true },
          orderBy: { priceAmount: 'asc' },
        },
        reviews: {
          select: { rating: true },
        },
      },
    });

    return mentors.map((m) => {
      const activePlans = m.plans.map((p) => ({
        ...p,
        priceAmount: Number(p.priceAmount),
      }));

      const startingPrice =
        activePlans.length > 0 ? activePlans[0].priceAmount : null;
      const currency = activePlans.length > 0 ? activePlans[0].currency : 'XAF';

      const ratings = m.reviews.map((r) => r.rating);
      const avgRating =
        ratings.length > 0
          ? (
              ratings.reduce((acc, curr) => acc + curr, 0) / ratings.length
            ).toFixed(1)
          : null;

      const skills = m.user.userSkills.map((us) => ({
        id: us.skill.id,
        name: us.skill.name,
        level: us.level,
      }));

      return {
        id: m.id,
        slug: m.slug || m.id,
        fullName: m.fullName,
        title: m.title,
        company: m.company,
        bio: m.bio,
        isVerified: m.isVerified,
        startingPrice,
        currency,
        avgRating,
        skills: skills.slice(0, 3),
      };
    });
  }

  async getPlatformStats() {
    const [mentorCount, sessionCount, reviews] = await Promise.all([
      this.prisma.mentorProfile.count({
        where: { isVerified: true, onboardingStatus: 'COMPLETE' },
      }),
      this.prisma.session.count({
        where: { status: 'COMPLETED' },
      }),
      this.prisma.review.findMany({
        select: { rating: true },
      }),
    ]);

    const activeMentors = Math.max(mentorCount, 500);
    const completedSessions = Math.max(sessionCount, 20000);
    
    let satisfactionRate = 99;
    if (reviews.length > 0) {
      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      satisfactionRate = Math.round((avg / 5) * 100);
    }

    return {
      activeMentors,
      completedSessions,
      satisfactionRate,
    };
  }
}

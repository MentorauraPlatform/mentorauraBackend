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
}

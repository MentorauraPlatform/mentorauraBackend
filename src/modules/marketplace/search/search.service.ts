import { Prisma } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SearchMentorsQueryDto } from './dto/search-mentors-query.dto';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchMentors(dto: SearchMentorsQueryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.MentorProfileWhereInput = {
      isVerified: true,
      onboardingStatus: 'COMPLETE',
    };

    if (dto.q && dto.q.trim().length > 0) {
      const searchTerm = dto.q.trim();
      whereClause.OR = [
        { fullName: { contains: searchTerm, mode: 'insensitive' } },
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { company: { contains: searchTerm, mode: 'insensitive' } },
        { bio: { contains: searchTerm, mode: 'insensitive' } },
        { areasOfExpertise: { hasSome: [searchTerm] } },
      ];
    }

    if (dto.category && dto.category.trim().length > 0) {
      whereClause.mentorCategories = {
        some: {
          category: {
            slug: dto.category.trim(),
          },
        },
      };
    }

    if (dto.skill && dto.skill.trim().length > 0) {
      whereClause.user = {
        userSkills: {
          some: {
            OR: [
              { skillId: dto.skill.trim() },
              {
                skill: {
                  name: { contains: dto.skill.trim(), mode: 'insensitive' },
                },
              },
            ],
          },
        },
      };
    }

    const [total, mentors] = await Promise.all([
      this.prisma.mentorProfile.count({ where: whereClause }),
      this.prisma.mentorProfile.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              email: true,
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
            select: {
              rating: true,
            },
          },
        },
      }),
    ]);

    const items = mentors.map((m) => {
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
        userId: m.userId,
        slug: m.slug || m.id,
        fullName: m.fullName,
        title: m.title,
        company: m.company,
        bio: m.bio,
        experience: m.experience,
        areasOfExpertise: m.areasOfExpertise,
        isVerified: m.isVerified,
        startingPrice,
        currency,
        avgRating,
        reviewCount: ratings.length,
        skills: skills.slice(0, 5),
        plansCount: activePlans.length,
      };
    });

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMentorBySlugOrId(slugOrId: string) {
    const mentor = await this.prisma.mentorProfile.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        isVerified: true,
        onboardingStatus: 'COMPLETE',
      },
      include: {
        user: {
          select: {
            email: true,
            createdAt: true,
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
          include: {
            reviewer: {
              select: {
                id: true,
                menteeProfile: {
                  select: { fullName: true, avatarUrl: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        mentorCategories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor not found or profile incomplete');
    }

    const plans = mentor.plans.map((p) => ({
      ...p,
      priceAmount: Number(p.priceAmount),
    }));

    const ratings = mentor.reviews.map((r) => r.rating);
    const avgRating =
      ratings.length > 0
        ? (
            ratings.reduce((acc, curr) => acc + curr, 0) / ratings.length
          ).toFixed(1)
        : null;

    const skills = mentor.user.userSkills.map((us) => ({
      id: us.skill.id,
      name: us.skill.name,
      level: us.level,
    }));

    const categories = mentor.mentorCategories.map((mc) => mc.category);

    return {
      id: mentor.id,
      userId: mentor.userId,
      slug: mentor.slug || mentor.id,
      fullName: mentor.fullName,
      title: mentor.title,
      company: mentor.company,
      bio: mentor.bio,
      experience: mentor.experience,
      areasOfExpertise: mentor.areasOfExpertise,
      availability: mentor.availability,
      isVerified: mentor.isVerified,
      avgRating,
      reviewCount: ratings.length,
      categories,
      skills,
      plans,
      reviews: mentor.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewerName: r.reviewer.menteeProfile?.fullName || 'Anonymous Mentee',
        reviewerAvatar: r.reviewer.menteeProfile?.avatarUrl || null,
      })),
    };
  }
}

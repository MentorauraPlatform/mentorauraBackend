import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter'; // NEW
import { Prisma } from '@prisma/client'; // NEW
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2, // NEW
  ) {}

  // NEW: optional client so it can run inside a transaction
  private async getMentorStats(
    mentorId: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const ratings = await client.review.findMany({
      where: { mentorId },
      select: { rating: true },
    });
    const reviewCount = ratings.length;
    const avgRating =
      reviewCount > 0
        ? (ratings.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1)
        : '0.0';

    const breakdown: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const r of ratings) {
      breakdown[String(r.rating)] += 1;
    }
    return { avgRating, reviewCount, breakdown };
  }

  async createReview(userId: string, mentorshipId: string, dto: CreateReviewDto) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: mentorshipId },
    });
    if (!mentorship) throw new NotFoundException('Mentorship not found');
    if (mentorship.menteeId !== userId) {
      throw new ForbiddenException('Only the mentee of this mentorship can leave a review');
    }
    if (mentorship.status !== 'ACTIVE' && mentorship.status !== 'COMPLETED') {
      throw new BadRequestException('You can only review an active or completed mentorship');
    }

    const existing = await this.prisma.review.findFirst({
      where: { mentorshipId, reviewerId: userId },
    });
    if (existing) throw new ConflictException('You have already reviewed this mentorship');

    // NEW: save the review and the mentor's cached rating together
    let review;
    let stats;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            mentorshipId,
            reviewerId: userId,
            mentorId: mentorship.mentorId,
            rating: dto.rating,
            comment: dto.comment,
          },
        });
        const newStats = await this.getMentorStats(mentorship.mentorId, tx);
        await tx.mentorProfile.update({
          where: { id: mentorship.mentorId },
          data: {
            ratingAvg: Number(newStats.avgRating),
            reviewCount: newStats.reviewCount,
          },
        });
        return { created, newStats };
      });
      review = result.created;
      stats = result.newStats;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('You have already reviewed this mentorship');
      }
      throw e;
    }

    // NEW: domain event
    this.eventEmitter.emit('mentorship.reviewed', {
      reviewId: review.id,
      mentorshipId,
      mentorId: mentorship.mentorId,
      menteeId: userId,
      rating: review.rating,
    });

    return { data: review, mentorStats: stats };
  }

  async getMyReview(userId: string, mentorshipId: string) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: mentorshipId },
    });
    if (!mentorship) throw new NotFoundException('Mentorship not found');
    if (mentorship.menteeId !== userId) {
      throw new ForbiddenException('This is not your mentorship');
    }

    const review = await this.prisma.review.findFirst({
      where: { mentorshipId, reviewerId: userId },
    });
    return { data: review ?? null };
  }

  private async listReviews(mentorId: string, query: QueryReviewsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = {
      mentorId,
      ...(query.rating ? { rating: query.rating } : {}),
    };

    const [total, reviews] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          reviewer: {
            select: { menteeProfile: { select: { fullName: true, avatarUrl: true } } },
          },
        },
      }),
    ]);

    const items = reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerName: r.reviewer?.menteeProfile?.fullName ?? 'Verified Mentee',
      reviewerAvatarUrl: r.reviewer?.menteeProfile?.avatarUrl ?? null,
    }));

    const stats = await this.getMentorStats(mentorId);
    return { items, total, page, limit, ...stats };
  }

  async getMentorReviews(slugOrId: string, query: QueryReviewsDto) {
    const mentor = await this.prisma.mentorProfile.findFirst({
      where: { OR: [{ id: slugOrId }, { slug: slugOrId }] },
      select: { id: true },
    });
    if (!mentor) throw new NotFoundException('Mentor not found');
    return { data: await this.listReviews(mentor.id, query) };
  }

  async getMyReceivedReviews(userId: string, query: QueryReviewsDto) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!mentor) throw new NotFoundException('Mentor profile not found');
    return { data: await this.listReviews(mentor.id, query) };
  }
}
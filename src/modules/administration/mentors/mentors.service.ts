import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface QueryMentorApplicationsDto {
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface RejectMentorDto {
  rejectionReason: string;
}

@Injectable()
export class AdminMentorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getMentorApplications(query: QueryMentorApplicationsDto) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.max(Number(query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.status) {
      const statusUpper = query.status.toUpperCase();
      if (statusUpper === 'SUBMITTED' || statusUpper === 'PENDING') {
        where.onboardingStatus = { in: ['SUBMITTED', 'PENDING'] };
      } else if (statusUpper === 'COMPLETE' || statusUpper === 'VERIFIED') {
        where.OR = [
          { onboardingStatus: 'COMPLETE' },
          { isVerified: true },
        ];
      } else {
        where.onboardingStatus = statusUpper;
      }
    }

    if (query.q) {
      const searchConditions = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
        { company: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.mentorProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              createdAt: true,
              userSkills: {
                include: { skill: true },
              },
            },
          },
          mentorCategories: {
            include: { category: true },
          },
        },
      }),
      this.prisma.mentorProfile.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMentorApplicationDetail(id: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true,
            userSkills: {
              include: { skill: true },
            },
          },
        },
        mentorCategories: {
          include: { category: true },
        },
        plans: true,
        reviews: true,
      },
    });

    if (!mentor) {
      throw new NotFoundException(`Mentor profile with ID '${id}' not found`);
    }

    return { data: mentor };
  }

  async approveMentorApplication(adminId: string, id: string, ipAddress?: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { id },
    });

    if (!mentor) {
      throw new NotFoundException(`Mentor profile with ID '${id}' not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.mentorProfile.update({
        where: { id },
        data: {
          isVerified: true,
          onboardingStatus: 'COMPLETE',
        },
      });

      await tx.user.update({
        where: { id: mentor.userId },
        data: { isMentor: true },
      });

      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: 'MENTOR_APPROVED',
          targetId: id,
          details: { mentorId: id, userId: mentor.userId, email: updatedProfile.fullName },
          ipAddress: ipAddress || null,
        },
      });

      return updatedProfile;
    });

    this.eventEmitter.emit('mentor.application.approved', {
      mentorProfileId: updated.id,
      userId: updated.userId,
      adminId,
    });

    return { data: updated };
  }

  async rejectMentorApplication(
    adminId: string,
    id: string,
    dto: RejectMentorDto,
    ipAddress?: string,
  ) {
    if (!dto.rejectionReason || dto.rejectionReason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required');
    }

    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { id },
    });

    if (!mentor) {
      throw new NotFoundException(`Mentor profile with ID '${id}' not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.mentorProfile.update({
        where: { id },
        data: {
          isVerified: false,
          onboardingStatus: 'REJECTED',
          rejectionReason: dto.rejectionReason,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: 'MENTOR_REJECTED',
          targetId: id,
          details: {
            mentorId: id,
            userId: mentor.userId,
            reason: dto.rejectionReason,
          },
          ipAddress: ipAddress || null,
        },
      });

      return updatedProfile;
    });

    this.eventEmitter.emit('mentor.application.rejected', {
      mentorProfileId: updated.id,
      userId: updated.userId,
      reason: dto.rejectionReason,
      adminId,
    });

    return { data: updated };
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ModerationStatus, ModerationTargetType, Prisma } from '@prisma/client';

export interface GetReportsFilter {
  page?: number;
  limit?: number;
  status?: ModerationStatus;
  targetType?: ModerationTargetType;
}

export interface CreateReportDto {
  targetType: ModerationTargetType;
  targetId: string;
  reason: string;
  details?: string;
}

export interface ModerationActionDto {
  action: 'DELETE_CONTENT' | 'SUSPEND_USER' | 'DISMISS' | 'WARN_USER';
  notes?: string;
}

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async getReports(filter: GetReportsFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ModerationReportWhereInput = {};

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.targetType) {
      where.targetType = filter.targetType;
    }

    const [reports, total] = await Promise.all([
      this.prisma.moderationReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: {
            select: {
              id: true,
              email: true,
              role: true,
              menteeProfile: { select: { fullName: true, avatarUrl: true } },
              mentorProfile: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.moderationReport.count({ where }),
    ]);

    // Hydrate preview content for each report
    const hydrated = await Promise.all(
      reports.map(async (report) => {
        let targetPreview: any = null;

        try {
          if (report.targetType === ModerationTargetType.MESSAGE) {
            const msg = await this.prisma.message.findUnique({
              where: { id: report.targetId },
              include: {
                sender: {
                  select: {
                    id: true,
                    email: true,
                    role: true,
                    menteeProfile: { select: { fullName: true, avatarUrl: true } },
                    mentorProfile: { select: { fullName: true } },
                  },
                },
              },
            });
            if (msg) {
              const senderName =
                msg.sender.mentorProfile?.fullName ||
                msg.sender.menteeProfile?.fullName ||
                msg.sender.email;
              const senderAvatar =
                msg.sender.menteeProfile?.avatarUrl || null;
              targetPreview = {
                type: 'MESSAGE',
                id: msg.id,
                content: msg.content,
                createdAt: msg.createdAt,
                sender: {
                  id: msg.sender.id,
                  name: senderName,
                  email: msg.sender.email,
                  avatarUrl: senderAvatar,
                },
              };
            }
          } else if (report.targetType === ModerationTargetType.USER_PROFILE) {
            const user = await this.prisma.user.findUnique({
              where: { id: report.targetId },
              select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                mentorProfile: {
                  select: {
                    id: true,
                    fullName: true,
                    headline: true,
                    bio: true,
                    isVerified: true,
                  },
                },
                menteeProfile: {
                  select: {
                    id: true,
                    fullName: true,
                    avatarUrl: true,
                    headline: true,
                  },
                },
              },
            });
            if (user) {
              const name =
                user.mentorProfile?.fullName ||
                user.menteeProfile?.fullName ||
                user.email;
              const avatar = user.menteeProfile?.avatarUrl || null;
              targetPreview = {
                type: 'USER_PROFILE',
                id: user.id,
                name,
                email: user.email,
                avatarUrl: avatar,
                role: user.role,
                isActive: user.isActive,
                headline:
                  user.mentorProfile?.headline || user.menteeProfile?.headline,
                bio: user.mentorProfile?.bio,
              };
            }
          } else if (report.targetType === ModerationTargetType.REVIEW) {
            const review = await this.prisma.review.findUnique({
              where: { id: report.targetId },
              include: {
                reviewer: {
                  select: {
                    id: true,
                    email: true,
                    menteeProfile: { select: { fullName: true, avatarUrl: true } },
                  },
                },
              },
            });
            if (review) {
              targetPreview = {
                type: 'REVIEW',
                id: review.id,
                rating: review.rating,
                comment: review.comment,
                author: {
                  id: review.reviewer.id,
                  name: review.reviewer.menteeProfile?.fullName || review.reviewer.email,
                  avatarUrl: review.reviewer.menteeProfile?.avatarUrl || null,
                },
              };
            }
          }
        } catch {
          // If deleted or lookup fails, targetPreview stays null
        }

        const reporterName =
          report.reporter?.mentorProfile?.fullName ||
          report.reporter?.menteeProfile?.fullName ||
          report.reporter?.email ||
          'Unknown';
        const reporterAvatar =
          report.reporter?.menteeProfile?.avatarUrl || null;

        return {
          ...report,
          reporter: {
            id: report.reporterId,
            name: reporterName,
            email: report.reporter?.email,
            avatarUrl: reporterAvatar,
          },
          targetPreview,
        };
      }),
    );

    return {
      data: hydrated,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStats() {
    const [total, pending, actionTaken, dismissed, byMessage, byProfile, byReview] =
      await Promise.all([
        this.prisma.moderationReport.count(),
        this.prisma.moderationReport.count({
          where: { status: ModerationStatus.PENDING },
        }),
        this.prisma.moderationReport.count({
          where: { status: ModerationStatus.ACTION_TAKEN },
        }),
        this.prisma.moderationReport.count({
          where: { status: ModerationStatus.DISMISSED },
        }),
        this.prisma.moderationReport.count({
          where: { targetType: ModerationTargetType.MESSAGE },
        }),
        this.prisma.moderationReport.count({
          where: { targetType: ModerationTargetType.USER_PROFILE },
        }),
        this.prisma.moderationReport.count({
          where: { targetType: ModerationTargetType.REVIEW },
        }),
      ]);

    return {
      total,
      pending,
      actionTaken,
      dismissed,
      breakdown: {
        messages: byMessage,
        profiles: byProfile,
        reviews: byReview,
      },
    };
  }

  async createReport(reporterId: string, dto: CreateReportDto) {
    if (!dto.targetType || !dto.targetId || !dto.reason) {
      throw new BadRequestException('Target type, target ID, and reason are required');
    }

    const report = await this.prisma.moderationReport.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: dto.details || null,
        status: ModerationStatus.PENDING,
      },
      include: {
        reporter: {
          select: { id: true, email: true },
        },
      },
    });

    return report;
  }

  async takeAction(
    adminId: string,
    reportId: string,
    dto: ModerationActionDto,
    ipAddress?: string,
  ) {
    const report = await this.prisma.moderationReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`Moderation report with ID ${reportId} not found`);
    }

    const newStatus =
      dto.action === 'DISMISS'
        ? ModerationStatus.DISMISSED
        : ModerationStatus.ACTION_TAKEN;

    await this.prisma.$transaction(async (tx) => {
      // Execute the physical action
      if (dto.action === 'DELETE_CONTENT') {
        if (report.targetType === ModerationTargetType.MESSAGE) {
          await tx.message.deleteMany({ where: { id: report.targetId } });
        } else if (report.targetType === ModerationTargetType.REVIEW) {
          await tx.review.deleteMany({ where: { id: report.targetId } });
        }
      } else if (dto.action === 'SUSPEND_USER') {
        let userIdToSuspend = report.targetId;

        // If target was a message or review, find the author
        if (report.targetType === ModerationTargetType.MESSAGE) {
          const msg = await tx.message.findUnique({
            where: { id: report.targetId },
            select: { senderId: true },
          });
          if (msg) userIdToSuspend = msg.senderId;
        } else if (report.targetType === ModerationTargetType.REVIEW) {
          const rev = await tx.review.findUnique({
            where: { id: report.targetId },
            select: { reviewerId: true },
          });
          if (rev) userIdToSuspend = rev.reviewerId;
        }

        await tx.user.updateMany({
          where: { id: userIdToSuspend },
          data: { isActive: false },
        });
      }

      // Update report status
      await tx.moderationReport.update({
        where: { id: reportId },
        data: {
          status: newStatus,
          actionTaken: dto.action,
          notes: dto.notes || null,
          resolvedAt: new Date(),
        },
      });

      // Audit log
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: `MODERATION_${dto.action}`,
          targetId: report.targetId,
          details: {
            targetType: report.targetType,
            reportId,
            action: dto.action,
            notes: dto.notes,
          },
          ipAddress: ipAddress || '127.0.0.1',
        },
      });
    });

    return {
      message: `Moderation action ${dto.action} successfully applied`,
      status: newStatus,
    };
  }
}

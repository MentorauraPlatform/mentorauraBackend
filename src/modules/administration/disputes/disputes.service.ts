import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DisputeStatus, DisputeReason, Prisma } from '@prisma/client';

export interface GetDisputesFilter {
  page?: number;
  limit?: number;
  status?: DisputeStatus;
  reason?: DisputeReason;
  search?: string;
}

export interface CreateDisputeDto {
  title: string;
  description: string;
  reason: DisputeReason;
  bookingId?: string;
  mentorshipId?: string;
  targetUserId?: string;
}

export interface ResolveDisputeDto {
  status: DisputeStatus;
  resolutionNotes: string;
  refundAmount?: number;
}

@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDisputes(filter: GetDisputesFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.DisputeWhereInput = {};

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.reason) {
      where.reason = filter.reason;
    }

    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        {
          raisedBy: {
            OR: [
              { email: { contains: filter.search, mode: 'insensitive' } },
              { menteeProfile: { fullName: { contains: filter.search, mode: 'insensitive' } } },
              { mentorProfile: { fullName: { contains: filter.search, mode: 'insensitive' } } },
            ],
          },
        },
      ];
    }

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          raisedBy: {
            select: {
              id: true,
              email: true,
              role: true,
              menteeProfile: { select: { fullName: true, avatarUrl: true } },
              mentorProfile: { select: { fullName: true } },
            },
          },
          targetUser: {
            select: {
              id: true,
              email: true,
              role: true,
              menteeProfile: { select: { fullName: true, avatarUrl: true } },
              mentorProfile: { select: { fullName: true } },
            },
          },
          booking: {
            select: {
              id: true,
              scheduledAt: true,
              durationMinutes: true,
              status: true,
            },
          },
          mentorship: {
            select: {
              id: true,
              status: true,
              plan: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.dispute.count({ where }),
    ]);

    const formatted = disputes.map((d) => {
      const raisedByName =
        d.raisedBy?.mentorProfile?.fullName ||
        d.raisedBy?.menteeProfile?.fullName ||
        d.raisedBy?.email ||
        'Unknown';
      const raisedByAvatar =
        d.raisedBy?.menteeProfile?.avatarUrl || null;

      const targetUserName = d.targetUser
        ? d.targetUser.mentorProfile?.fullName ||
          d.targetUser.menteeProfile?.fullName ||
          d.targetUser.email
        : null;
      const targetUserAvatar = d.targetUser
        ? d.targetUser.menteeProfile?.avatarUrl || null
        : null;

      return {
        ...d,
        raisedBy: {
          id: d.raisedById,
          name: raisedByName,
          email: d.raisedBy?.email,
          avatarUrl: raisedByAvatar,
          role: d.raisedBy?.role,
        },
        targetUser: d.targetUser
          ? {
              id: d.targetUserId,
              name: targetUserName,
              email: d.targetUser.email,
              avatarUrl: targetUserAvatar,
              role: d.targetUser.role,
            }
          : null,
        refundAmount: d.refundAmount ? Number(d.refundAmount) : null,
      };
    });

    return {
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDisputeById(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        raisedBy: {
          select: {
            id: true,
            email: true,
            role: true,
            menteeProfile: { select: { fullName: true, avatarUrl: true } },
            mentorProfile: { select: { fullName: true } },
          },
        },
        targetUser: {
          select: {
            id: true,
            email: true,
            role: true,
            menteeProfile: { select: { fullName: true, avatarUrl: true } },
            mentorProfile: { select: { fullName: true } },
          },
        },
        booking: {
          include: {
            mentor: { select: { id: true, fullName: true } },
          },
        },
        mentorship: {
          include: {
            plan: true,
            payments: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute with ID ${id} not found`);
    }

    const raisedByName =
      dispute.raisedBy?.mentorProfile?.fullName ||
      dispute.raisedBy?.menteeProfile?.fullName ||
      dispute.raisedBy?.email ||
      'Unknown';
    const targetUserName = dispute.targetUser
      ? dispute.targetUser.mentorProfile?.fullName ||
        dispute.targetUser.menteeProfile?.fullName ||
        dispute.targetUser.email
      : null;

    return {
      ...dispute,
      raisedBy: {
        id: dispute.raisedById,
        name: raisedByName,
        email: dispute.raisedBy?.email,
        avatarUrl: dispute.raisedBy?.menteeProfile?.avatarUrl || null,
        role: dispute.raisedBy?.role,
      },
      targetUser: dispute.targetUser
        ? {
            id: dispute.targetUserId,
            name: targetUserName,
            email: dispute.targetUser.email,
            avatarUrl: dispute.targetUser.menteeProfile?.avatarUrl || null,
            role: dispute.targetUser.role,
          }
        : null,
      refundAmount: dispute.refundAmount ? Number(dispute.refundAmount) : null,
      mentorship: dispute.mentorship
        ? {
            ...dispute.mentorship,
            payments: dispute.mentorship.payments.map((p) => ({
              ...p,
              amount: Number(p.amount),
            })),
          }
        : null,
    };
  }

  async getDisputeStats() {
    const [total, open, underReview, resolvedRefunded, resolvedRejected] =
      await Promise.all([
        this.prisma.dispute.count(),
        this.prisma.dispute.count({ where: { status: DisputeStatus.OPEN } }),
        this.prisma.dispute.count({
          where: { status: DisputeStatus.UNDER_REVIEW },
        }),
        this.prisma.dispute.count({
          where: { status: DisputeStatus.RESOLVED_REFUNDED },
        }),
        this.prisma.dispute.count({
          where: { status: DisputeStatus.RESOLVED_REJECTED },
        }),
      ]);

    return {
      total,
      open,
      underReview,
      resolvedRefunded,
      resolvedRejected,
      closed: total - (open + underReview),
    };
  }

  async createDispute(userId: string, dto: CreateDisputeDto) {
    if (!dto.title || !dto.description) {
      throw new BadRequestException('Title and description are required');
    }

    let targetUserId = dto.targetUserId;

    // If booking provided, resolve target user if not specified
    if (dto.bookingId && !targetUserId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        include: { mentor: { select: { userId: true } } },
      });
      if (booking) {
        if (booking.menteeId === userId) {
          targetUserId = booking.mentor.userId;
        } else if (booking.mentor.userId === userId) {
          targetUserId = booking.menteeId;
        }
      }
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        raisedById: userId,
        targetUserId,
        bookingId: dto.bookingId || null,
        mentorshipId: dto.mentorshipId || null,
        title: dto.title,
        description: dto.description,
        reason: dto.reason || DisputeReason.OTHER,
        status: DisputeStatus.OPEN,
      },
      include: {
        raisedBy: {
          select: { id: true, email: true },
        },
      },
    });

    return dispute;
  }

  async resolveDispute(
    adminId: string,
    id: string,
    dto: ResolveDisputeDto,
    ipAddress?: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute with ID ${id} not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedDispute = await tx.dispute.update({
        where: { id },
        data: {
          status: dto.status,
          resolutionNotes: dto.resolutionNotes,
          refundAmount: dto.refundAmount ? BigInt(dto.refundAmount) : null,
          resolvedAt: new Date(),
        },
      });

      // If refunded, update booking status if exists
      if (
        dto.status === DisputeStatus.RESOLVED_REFUNDED &&
        dispute.bookingId
      ) {
        await tx.booking.update({
          where: { id: dispute.bookingId },
          data: { status: 'CANCELLED' },
        });
      }

      // Record audit log
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: `DISPUTE_${dto.status}`,
          targetId: id,
          details: {
            targetType: 'DISPUTE',
            resolutionNotes: dto.resolutionNotes,
            refundAmount: dto.refundAmount,
            previousStatus: dispute.status,
            newStatus: dto.status,
          },
          ipAddress: ipAddress || '127.0.0.1',
        },
      });

      return updatedDispute;
    });

    return {
      message: `Dispute status updated to ${dto.status}`,
      dispute: {
        ...updated,
        refundAmount: updated.refundAmount ? Number(updated.refundAmount) : null,
      },
    };
  }
}

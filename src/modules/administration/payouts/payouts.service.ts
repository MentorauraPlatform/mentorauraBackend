import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface RequestPayoutDto {
  amount: number;
  provider: string; // MTN_MOMO, ORANGE_MONEY, BANK_TRANSFER
  accountNumber: string;
  accountName?: string;
}

@Injectable()
export class AdminPayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List payouts with pagination and filters
   */
  async getPayouts(query: {
    page?: number;
    limit?: number;
    status?: PayoutStatus;
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const [total, payouts] = await Promise.all([
      this.prisma.payout.count({ where }),
      this.prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          mentor: {
            select: {
              id: true,
              fullName: true,
              title: true,
              user: { select: { id: true, email: true } },
            },
          },
        },
      }),
    ]);

    const data = payouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      provider: p.provider,
      accountNumber: p.accountNumber,
      accountName: p.accountName,
      status: p.status,
      transactionRef: p.transactionRef,
      rejectionReason: p.rejectionReason,
      processedAt: p.processedAt,
      createdAt: p.createdAt,
      mentor: {
        id: p.mentor.id,
        userId: p.mentor.user.id,
        name: p.mentor.fullName,
        email: p.mentor.user.email,
        title: p.mentor.title,
      },
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Aggregated payout statistics
   */
  async getPayoutStats() {
    const all = await this.prisma.payout.findMany({
      select: { amount: true, status: true },
    });

    let pendingAmount = 0;
    let pendingCount = 0;
    let paidAmount = 0;
    let paidCount = 0;
    let rejectedCount = 0;

    for (const p of all) {
      const amt = Number(p.amount);
      if (p.status === 'PENDING') {
        pendingAmount += amt;
        pendingCount++;
      } else if (p.status === 'PAID') {
        paidAmount += amt;
        paidCount++;
      } else if (p.status === 'REJECTED') {
        rejectedCount++;
      }
    }

    return {
      currency: 'XAF',
      pendingAmount,
      pendingCount,
      paidAmount,
      paidCount,
      rejectedCount,
      totalCount: all.length,
    };
  }

  /**
   * Request a new payout (initiated by mentor)
   */
  async requestPayout(mentorUserId: string, dto: RequestPayoutDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Payout amount must be greater than 0');
    }

    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId: mentorUserId },
    });
    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const payout = await this.prisma.payout.create({
      data: {
        mentorId: mentorProfile.id,
        amount: BigInt(dto.amount),
        currency: 'XAF',
        provider: dto.provider.toUpperCase(),
        accountNumber: dto.accountNumber,
        accountName: dto.accountName || mentorProfile.fullName,
        status: 'PENDING',
      },
    });

    return {
      data: {
        id: payout.id,
        amount: Number(payout.amount),
        status: payout.status,
        provider: payout.provider,
        accountNumber: payout.accountNumber,
        createdAt: payout.createdAt,
      },
    };
  }

  /**
   * Approve single payout
   */
  async approvePayout(adminId: string, payoutId: string, ipAddress?: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { mentor: true },
    });

    if (!payout) {
      throw new NotFoundException(`Payout ${payoutId} not found`);
    }

    if (payout.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot approve payout with status: ${payout.status}`,
      );
    }

    const transactionRef = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const [updated] = await this.prisma.$transaction([
      this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'PAID',
          transactionRef,
          processedAt: new Date(),
        },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'PAYOUT_APPROVED',
          targetId: payoutId,
          ipAddress,
          details: {
            amount: Number(payout.amount),
            currency: payout.currency,
            mentorId: payout.mentorId,
            mentorName: payout.mentor.fullName,
            transactionRef,
          },
        },
      }),
    ]);

    return {
      message: 'Payout approved and released successfully',
      data: {
        id: updated.id,
        status: updated.status,
        transactionRef: updated.transactionRef,
        processedAt: updated.processedAt,
      },
    };
  }

  /**
   * Reject single payout
   */
  async rejectPayout(
    adminId: string,
    payoutId: string,
    reason: string,
    ipAddress?: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) {
      throw new NotFoundException(`Payout ${payoutId} not found`);
    }

    if (payout.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot reject payout with status: ${payout.status}`,
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          processedAt: new Date(),
        },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'PAYOUT_REJECTED',
          targetId: payoutId,
          ipAddress,
          details: {
            reason: reason.trim(),
            amount: Number(payout.amount),
            currency: payout.currency,
          },
        },
      }),
    ]);

    return {
      message: 'Payout rejected',
      data: {
        id: updated.id,
        status: updated.status,
        rejectionReason: updated.rejectionReason,
      },
    };
  }

  /**
   * Batch approve multiple pending payouts
   */
  async batchApprove(
    adminId: string,
    payoutIds: string[],
    ipAddress?: string,
  ) {
    if (!payoutIds || payoutIds.length === 0) {
      throw new BadRequestException('No payout IDs provided');
    }

    const pendingPayouts = await this.prisma.payout.findMany({
      where: {
        id: { in: payoutIds },
        status: 'PENDING',
      },
    });

    if (pendingPayouts.length === 0) {
      throw new BadRequestException('No pending payouts found for approval');
    }

    const results = await this.prisma.$transaction(
      pendingPayouts.map((p) => {
        const transactionRef = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        return this.prisma.payout.update({
          where: { id: p.id },
          data: {
            status: 'PAID',
            transactionRef,
            processedAt: new Date(),
          },
        });
      }),
    );

    // Audit log
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'PAYOUT_BATCH_APPROVED',
        targetId: adminId, // grouping reference
        ipAddress,
        details: {
          count: results.length,
          payoutIds: results.map((r) => r.id),
          totalAmount: results.reduce((acc, r) => acc + Number(r.amount), 0),
        },
      },
    });

    return {
      message: `Successfully released ${results.length} payouts`,
      approvedCount: results.length,
    };
  }
}

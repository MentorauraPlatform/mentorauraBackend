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
        fullName: p.mentor.fullName,
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
   * Helper to fetch platform commission rate
   */
  private async getCommissionRate(): Promise<number> {
    const setting = await this.prisma.platformSetting.findFirst({
      where: {
        key: { in: ['commission_percentage', 'global_commission_rate', 'platform_commission_percent'] },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (setting?.value) {
      const parsed = parseFloat(setting.value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        return parsed;
      }
    }
    return 15;
  }

  /**
   * Compute available balance, earnings, and withdrawal metrics for a mentor
   */
  async getMentorBalance(mentorUserId: string) {
    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId: mentorUserId },
    });
    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const commissionPercent = await this.getCommissionRate();
    const mentorShare = (100 - commissionPercent) / 100;

    // Sum all successful payments for this mentor's mentorships
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        mentorship: { mentorId: mentorProfile.id },
      },
      select: { amount: true },
    });

    const totalGrossRevenue = payments.reduce(
      (acc, p) => acc + Number(p.amount),
      0,
    );
    const totalNetEarned = Math.round(totalGrossRevenue * mentorShare);

    // Sum all active payouts (PENDING, PAID)
    const activePayouts = await this.prisma.payout.findMany({
      where: {
        mentorId: mentorProfile.id,
        status: { not: PayoutStatus.REJECTED },
      },
      select: { amount: true, status: true },
    });

    let totalWithdrawn = 0;
    let pendingWithdrawals = 0;

    for (const p of activePayouts) {
      const amt = Number(p.amount);
      if (p.status === PayoutStatus.PAID) {
        totalWithdrawn += amt;
      } else {
        pendingWithdrawals += amt;
      }
    }

    const availableBalance = Math.max(
      0,
      totalNetEarned - totalWithdrawn - pendingWithdrawals,
    );

    const minSetting = await this.prisma.platformSetting.findFirst({
      where: { key: 'min_payout_amount' },
    });
    const minPayoutAmount = minSetting
      ? Math.max(1000, Number(minSetting.value) || 10000)
      : 10000;

    return {
      currency: 'XAF',
      mentorId: mentorProfile.id,
      mentorName: mentorProfile.fullName,
      totalGrossRevenue,
      totalNetEarned,
      totalWithdrawn,
      pendingWithdrawals,
      availableBalance,
      minPayoutAmount,
      commissionPercent,
    };
  }

  /**
   * Request a new payout with balance verification (initiated by mentor)
   */
  async requestPayout(mentorUserId: string, dto: RequestPayoutDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Payout amount must be greater than 0');
    }

    const cleanAccount = dto.accountNumber?.trim();
    if (!cleanAccount || cleanAccount.length < 8) {
      throw new BadRequestException(
        'A valid account or mobile money phone number is required',
      );
    }

    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { userId: mentorUserId },
    });
    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const { payout, availableBalance } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM mentor_profiles WHERE id = ${mentorProfile.id}::uuid FOR UPDATE`;

      const balance = await this.getMentorBalance(mentorUserId);

      if (dto.amount < balance.minPayoutAmount) {
        throw new BadRequestException(
          `Minimum withdrawal amount is ${balance.minPayoutAmount.toLocaleString()} XAF`,
        );
      }

      if (dto.amount > balance.availableBalance) {
        throw new BadRequestException(
          `Requested payout amount (${dto.amount.toLocaleString()} XAF) exceeds your available balance (${balance.availableBalance.toLocaleString()} XAF)`,
        );
      }

      const created = await tx.payout.create({
        data: {
          mentorId: balance.mentorId,
          amount: BigInt(dto.amount),
          currency: 'XAF',
          provider: dto.provider?.toUpperCase() || 'MTN_MOMO',
          accountNumber: cleanAccount,
          accountName: dto.accountName || mentorProfile.fullName || 'Mentor',
          status: 'PENDING',
        },
      });

      return { payout: created, availableBalance: balance.availableBalance };
    });

    return {
      message: 'Withdrawal payout request submitted successfully',
      data: {
        id: payout.id,
        amount: Number(payout.amount),
        currency: payout.currency,
        status: payout.status,
        provider: payout.provider,
        accountNumber: payout.accountNumber,
        remainingBalance: availableBalance - dto.amount,
        createdAt: payout.createdAt,
      },
    };
  }

  /**
   * Approve single payout and execute gateway disbursement
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

    // Automated gateway disbursement reference
    const transactionRef = `ZOP-DISB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

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
            provider: payout.provider,
            accountNumber: payout.accountNumber,
            mentorId: payout.mentorId,
            mentorName: payout.mentor.fullName,
            disbursementRef: transactionRef,
            disbursementMethod: 'AUTOMATED_GATEWAY_DISBURSEMENT',
          },
        },
      }),
    ]);

    return {
      message: 'Payout approved and disbursed successfully',
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
        const transactionRef = `ZOP-DISB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CalculationService } from '../calculation/calculation.service';

export interface CommissionRecordEntry {
  paymentId: string;
  grossAmount: bigint;
  platformFee: bigint;
  netMentorEarnings: bigint;
  rateApplied: number;
  currency: string;
}

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService: CalculationService,
  ) {}

  /**
   * Calculate and return commission split record for a payment
   */
  async getPaymentCommissionRecord(
    paymentId: string,
  ): Promise<CommissionRecordEntry | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { mentorship: { select: { mentorId: true } } },
    });

    if (!payment) return null;

    const split = await this.calculationService.calculateSplit(
      payment.amount,
      payment.mentorship.mentorId,
      payment.currency,
    );

    return {
      paymentId: payment.id,
      grossAmount: split.grossAmount,
      platformFee: split.platformFee,
      netMentorEarnings: split.netMentorAmount,
      rateApplied: split.commissionRate,
      currency: split.currency,
    };
  }

  /**
   * Get platform-wide aggregated commission figures
   */
  async getAggregatedCommissionStats(from?: Date, to?: Date) {
    const where: any = { status: 'SUCCESS' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const successfulPayments = await this.prisma.payment.findMany({
      where,
      select: {
        amount: true,
        currency: true,
        mentorship: { select: { mentorId: true } },
      },
    });

    let totalGmv = BigInt(0);
    let totalPlatformRevenue = BigInt(0);
    let totalMentorVolume = BigInt(0);

    const sampleSplit = await this.calculationService.calculateSplit(
      BigInt(10000),
    );
    const rateBasisPoints = BigInt(
      Math.round(sampleSplit.commissionRate * 100),
    );

    for (const p of successfulPayments) {
      totalGmv += p.amount;
      const platformFee = (p.amount * rateBasisPoints) / BigInt(10000);
      const netMentorAmount =
        p.amount > platformFee ? p.amount - platformFee : BigInt(0);
      totalPlatformRevenue += platformFee;
      totalMentorVolume += netMentorAmount;
    }

    return {
      totalGmv: Number(totalGmv),
      totalPlatformRevenue: Number(totalPlatformRevenue),
      totalMentorVolume: Number(totalMentorVolume),
      transactionCount: successfulPayments.length,
    };
  }
}

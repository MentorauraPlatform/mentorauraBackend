import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface FinancialSummaryDto {
  currency: string;
  totalGmv: number;
  platformCommissionPercent: number;
  totalPlatformRevenue: number;
  netMentorEarnings: number;
  totalTransactionsCount: number;
  successfulTransactionsCount: number;
  pendingTransactionsCount: number;
  failedTransactionsCount: number;
  providerBreakdown: {
    provider: string;
    count: number;
    amount: number;
  }[];
  monthlyTrend: {
    month: string;
    gmv: number;
    platformRevenue: number;
    count: number;
  }[];
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get Platform Commission Rate from PlatformSetting or default 15%
   */
  async getCommissionRate(): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: 'platform_commission_percent' },
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
   * Aggregate platform revenue and transaction metrics
   */
  async getFinancialSummary(): Promise<FinancialSummaryDto> {
    const commissionPercent = await this.getCommissionRate();

    const allPayments = await this.prisma.payment.findMany({
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        provider: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalGmv = 0;
    let successfulCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    const providerMap = new Map<string, { count: number; amount: number }>();
    const monthMap = new Map<string, { gmv: number; count: number }>();

    for (const payment of allPayments) {
      const amountNum = Number(payment.amount);
      const prov = payment.provider || 'OTHER';
      const isSuccess = payment.status === 'SUCCESS';

      if (isSuccess) {
        totalGmv += amountNum;
        successfulCount++;

        // Provider aggregation
        const currentProv = providerMap.get(prov) || { count: 0, amount: 0 };
        currentProv.count++;
        currentProv.amount += amountNum;
        providerMap.set(prov, currentProv);

        // Monthly trend (YYYY-MM)
        const monthKey = payment.createdAt.toISOString().slice(0, 7);
        const currentMonth = monthMap.get(monthKey) || { gmv: 0, count: 0 };
        currentMonth.gmv += amountNum;
        currentMonth.count++;
        monthMap.set(monthKey, currentMonth);
      } else if (payment.status === 'PENDING') {
        pendingCount++;
      } else {
        failedCount++;
      }
    }

    const totalPlatformRevenue = Math.round(
      (totalGmv * commissionPercent) / 100,
    );
    const netMentorEarnings = totalGmv - totalPlatformRevenue;

    const providerBreakdown = Array.from(providerMap.entries()).map(
      ([provider, data]) => ({
        provider,
        count: data.count,
        amount: data.amount,
      }),
    );

    // Sort last 6 months trend
    const monthlyTrend = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, data]) => ({
        month,
        gmv: data.gmv,
        platformRevenue: Math.round((data.gmv * commissionPercent) / 100),
        count: data.count,
      }));

    return {
      currency: 'XAF',
      totalGmv,
      platformCommissionPercent: commissionPercent,
      totalPlatformRevenue,
      netMentorEarnings,
      totalTransactionsCount: allPayments.length,
      successfulTransactionsCount: successfulCount,
      pendingTransactionsCount: pendingCount,
      failedTransactionsCount: failedCount,
      providerBreakdown,
      monthlyTrend,
    };
  }

  /**
   * Paginated transaction history for financial audit
   */
  async getTransactions(query: {
    page?: number;
    limit?: number;
    status?: string;
    provider?: string;
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status.toUpperCase();
    }
    if (query.provider) {
      where.provider = query.provider.toUpperCase();
    }

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              menteeProfile: { select: { fullName: true } },
            },
          },
          mentorship: {
            include: {
              mentor: {
                select: {
                  id: true,
                  fullName: true,
                  user: { select: { email: true } },
                },
              },
              plan: { select: { title: true } },
            },
          },
        },
      }),
    ]);

    const data = payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      provider: p.provider,
      status: p.status,
      providerReference: p.providerReference,
      createdAt: p.createdAt,
      mentee: {
        id: p.user.id,
        email: p.user.email,
        name: p.user.menteeProfile?.fullName || p.user.email.split('@')[0],
      },
      mentor: p.mentorship?.mentor
        ? {
            id: p.mentorship.mentor.id,
            name: p.mentorship.mentor.fullName,
            email: p.mentorship.mentor.user.email,
          }
        : null,
      planTitle: p.mentorship?.plan?.title || 'Mentorship Plan',
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
}

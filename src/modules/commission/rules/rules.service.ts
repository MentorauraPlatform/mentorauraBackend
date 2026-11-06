import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface CommissionRule {
  rate: number; // percentage (e.g. 15 for 15%)
  source: 'PLATFORM_DEFAULT' | 'CATEGORY_OVERRIDE' | 'MENTOR_CUSTOM';
}

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get effective commission rate for a transaction
   */
  async getEffectiveRate(mentorProfileId?: string): Promise<CommissionRule> {
    // 1. Check primary platform configuration key: global_commission_rate
    const primarySetting = await this.prisma.platformSetting.findUnique({
      where: { key: 'global_commission_rate' },
    });

    if (primarySetting?.value) {
      const parsed = parseFloat(primarySetting.value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        return { rate: parsed, source: 'PLATFORM_DEFAULT' };
      }
    }

    // 2. Fallback key: platform_commission_percent
    const fallbackSetting = await this.prisma.platformSetting.findUnique({
      where: { key: 'platform_commission_percent' },
    });

    if (fallbackSetting?.value) {
      const parsed = parseFloat(fallbackSetting.value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        return { rate: parsed, source: 'PLATFORM_DEFAULT' };
      }
    }

    // Default 15% platform commission
    return { rate: 15, source: 'PLATFORM_DEFAULT' };
  }
}

import { Injectable } from '@nestjs/common';
import { RulesService } from '../rules/rules.service';

export interface CommissionCalculationResult {
  grossAmount: bigint;
  commissionRate: number; // e.g. 15
  platformFee: bigint;
  netMentorAmount: bigint;
  currency: string;
}

@Injectable()
export class CalculationService {
  constructor(private readonly rulesService: RulesService) {}

  /**
   * Calculate commission split for a transaction
   */
  async calculateSplit(
    grossAmount: bigint | number,
    mentorProfileId?: string,
    currency = 'XAF',
  ): Promise<CommissionCalculationResult> {
    const gross = typeof grossAmount === 'number' ? BigInt(Math.round(grossAmount)) : grossAmount;
    const rule = await this.rulesService.getEffectiveRate(mentorProfileId);

    // Calculate platform fee using integer math for financial accuracy
    // platformFee = Math.round((gross * rate) / 100)
    const rateBasisPoints = BigInt(Math.round(rule.rate * 100));
    const platformFee = (gross * rateBasisPoints) / BigInt(10000);
    const netMentorAmount = gross > platformFee ? gross - platformFee : BigInt(0);

    return {
      grossAmount: gross,
      commissionRate: rule.rate,
      platformFee,
      netMentorAmount,
      currency,
    };
  }
}

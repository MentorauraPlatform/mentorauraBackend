/**
 * Placeholder adapter — Orange Money
 */
import {
  IPaymentProvider,
  InitiatePaymentPayload,
  PaymentInitiationResult,
  PaymentVerificationResult,
} from '../payment-provider.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrangeMoneyAdapter implements IPaymentProvider {
  readonly name = 'orange-money';

  async initiatePayment(payload: InitiatePaymentPayload): Promise<PaymentInitiationResult> {
    throw new Error('OrangeMoneyAdapter.initiatePayment() not yet implemented');
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    throw new Error('OrangeMoneyAdapter.verifyPayment() not yet implemented');
  }

  verifyWebhookSignature(payload: unknown, signature: string): boolean {
    throw new Error('OrangeMoneyAdapter.verifyWebhookSignature() not yet implemented');
  }
}

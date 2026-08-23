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

  initiatePayment(
    payload: InitiatePaymentPayload,
  ): Promise<PaymentInitiationResult> {
    return Promise.reject(
      new Error(
        `OrangeMoneyAdapter.initiatePayment() not yet implemented for ${payload.reference}`,
      ),
    );
  }

  verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    return Promise.reject(
      new Error(
        `OrangeMoneyAdapter.verifyPayment() not yet implemented for ${reference}`,
      ),
    );
  }

  verifyWebhookSignature(payload: unknown, signature: string): boolean {
    throw new Error(
      `OrangeMoneyAdapter.verifyWebhookSignature() not yet implemented for ${signature} on ${JSON.stringify(payload)}`,
    );
  }
}

/**
 * Placeholder adapter — MTN Mobile Money
 *
 * Replace the method bodies with actual MTN MoMo API calls
 * once the payment aggregator has been selected (see PRD §Payment Rails).
 */
import {
  IPaymentProvider,
  InitiatePaymentPayload,
  PaymentInitiationResult,
  PaymentVerificationResult,
} from '../payment-provider.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MtnMomoAdapter implements IPaymentProvider {
  readonly name = 'mtn-momo';

  initiatePayment(
    payload: InitiatePaymentPayload,
  ): Promise<PaymentInitiationResult> {
    // TODO: integrate MTN MoMo Collections API
    return Promise.reject(
      new Error(
        `MtnMomoAdapter.initiatePayment() not yet implemented for ${payload.reference}`,
      ),
    );
  }

  verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    // TODO: query MTN MoMo transaction status
    return Promise.reject(
      new Error(
        `MtnMomoAdapter.verifyPayment() not yet implemented for ${reference}`,
      ),
    );
  }

  verifyWebhookSignature(payload: unknown, signature: string): boolean {
    // TODO: verify MTN webhook HMAC signature
    throw new Error(
      `MtnMomoAdapter.verifyWebhookSignature() not yet implemented for ${signature} on ${JSON.stringify(payload)}`,
    );
  }
}

import { Injectable } from '@nestjs/common';
import {
  IPaymentProvider,
  InitiatePaymentPayload,
  PaymentInitiationResult,
  PaymentVerificationResult,
} from '../payment-provider.interface';
import { ZopayAdapter } from './zopay.adapter';

@Injectable()
export class MtnMomoAdapter implements IPaymentProvider {
  readonly name = 'mtn-momo';

  constructor(private readonly zopayAdapter: ZopayAdapter) {}

  async initiatePayment(
    payload: InitiatePaymentPayload,
  ): Promise<PaymentInitiationResult> {
    if (payload.customerPhone) {
      const quote = await this.zopayAdapter.createCollectionQuote({
        gateway: 'MTN_MOMO',
        transaction_type: 'COLLECTION',
        amount: payload.amount.toString(),
        currency: payload.currency,
        payer: {
          msisdn: payload.customerPhone,
        },
      });

      const collect = await this.zopayAdapter.executeCollection({
        quote_id: quote.quote_id,
        idempotency_key: payload.reference,
      });

      return {
        providerReference: collect.transaction_id,
        status: collect.status === 'SUCCESS' ? 'processing' : 'pending',
        ussdCode: '*126#',
        raw: { quote, collect },
      };
    }

    return this.zopayAdapter.initiatePayment(payload);
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    return this.zopayAdapter.verifyPayment(reference);
  }

  verifyWebhookSignature(payload: unknown, signature: string, timestamp?: string): boolean {
    return this.zopayAdapter.verifyWebhookSignature(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
      signature,
      timestamp,
    );
  }
}

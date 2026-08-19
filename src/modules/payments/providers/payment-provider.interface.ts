/**
 * Payment Provider Interface
 *
 * All payment integrations (MTN MoMo, Orange Money, Card, Bank)
 * MUST implement this interface. This ensures swapping providers
 * does not require changes to the Payments module.
 */
export interface IPaymentProvider {
  readonly name: string;

  /**
   * Initiate a new payment transaction.
   * Returns a provider-specific reference and redirect/USSD prompt.
   */
  initiatePayment(payload: InitiatePaymentPayload): Promise<PaymentInitiationResult>;

  /**
   * Verify the status of a previously initiated payment.
   */
  verifyPayment(reference: string): Promise<PaymentVerificationResult>;

  /**
   * Verify that a webhook payload is genuinely from this provider.
   */
  verifyWebhookSignature(payload: unknown, signature: string): boolean;
}

// ── Payload / Result types ───────────────────────────────────────────────────

export interface InitiatePaymentPayload {
  amount: number;
  currency: string;
  reference: string;         // internal idempotency key
  customerPhone?: string;
  customerEmail?: string;
  description: string;
  callbackUrl: string;
}

export interface PaymentInitiationResult {
  providerReference: string;
  status: 'pending' | 'processing';
  redirectUrl?: string;
  ussdCode?: string;
  raw: unknown;
}

export interface PaymentVerificationResult {
  providerReference: string;
  internalReference: string;
  status: 'success' | 'failed' | 'pending';
  amount: number;
  currency: string;
  paidAt?: Date;
  raw: unknown;
}

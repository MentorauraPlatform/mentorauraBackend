import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  IPaymentProvider,
  InitiatePaymentPayload,
  PaymentInitiationResult,
  PaymentVerificationResult,
} from '../payment-provider.interface';

export interface ZoPayQuoteRequest {
  gateway: 'MTN_MOMO' | 'ORANGE_MONEY';
  transaction_type: 'COLLECTION';
  amount: string;
  currency: string;
  payer: {
    msisdn: string;
  };
}

export interface ZoPayQuoteResponse {
  quote_id: string;
  fees: {
    gateway_fee: string;
    platform_fee: string;
  };
  total_amount: string;
  net_to_merchant: string;
  expires_at: string;
}

export interface ZoPayCollectRequest {
  quote_id: string;
  idempotency_key: string;
}

export interface ZoPayCollectResponse {
  transaction_id: string;
  status: 'PENDING' | 'VERIFYING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  gateway_reference?: string;
  correlation_id?: string;
}

export interface ZoPayCheckoutSessionRequest {
  amount: string;
  currency: string;
  description: string;
  gateways?: string[];
  expiresInMinutes?: number;
  successUrl?: string;
  cancelUrl?: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface ZoPayCheckoutSessionResponse {
  checkoutSession: {
    id: string;
    checkoutUrl: string;
    amount: string;
    currency: string;
    status: string;
    [key: string]: unknown;
  };
}

export interface ZoPayTransactionStatusResponse {
  transaction: {
    id: string;
    merchantId?: string;
    gateway: string;
    amount: string;
    currency: string;
    status: 'PENDING' | 'VERIFYING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
    gatewayReference?: string;
    gatewayFee?: string;
    platformFee?: string;
    createdAt?: string;
    completedAt?: string;
    failureReason?: string;
  };
}

@Injectable()
export class ZopayAdapter implements IPaymentProvider {
  readonly name = 'zopay';
  private readonly logger = new Logger(ZopayAdapter.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly origin: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('ZOPAY_BASE_URL') ||
      'https://sandbox.zopay.co'
    ).replace(/\/$/, '');

    this.apiKey = this.configService.get<string>('ZOPAY_API_KEY') || '';
    this.secretKey = this.configService.get<string>('ZOPAY_SECRET_KEY') || '';
    this.webhookSecret =
      this.configService.get<string>('ZOPAY_WEBHOOK_SECRET') ||
      this.configService.get<string>('PAYMENT_WEBHOOK_SECRET') ||
      '';
    this.origin =
      this.configService.get<string>('ZOPAY_ORIGIN') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000';

    this.isConfigured = Boolean(this.apiKey && this.secretKey);

    if (!this.isConfigured) {
      this.logger.warn(
        '⚠️ ZoPay API credentials are not configured (ZOPAY_API_KEY, ZOPAY_SECRET_KEY). Falling back to mock simulation mode for local testing.',
      );
    }
  }

  /**
   * Generates cryptographic HMAC-SHA256 headers for ZoPay API requests
   * Formula per docs:
   * stringToSign = METHOD + PATH + SORTED_QUERY_PARAMS + REQUEST_BODY + TIMESTAMP + NONCE + ORIGIN
   * Directly concatenated without separators.
   */
  generateHeaders(
    method: string,
    path: string,
    body: Record<string, unknown> | null = null,
    query: Record<string, string> = {},
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();

    const sortedQuery = Object.keys(query)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(query[k])}`)
      .join('&');

    const bodyStr = body ? JSON.stringify(body) : '';

    const stringToSign = `${method.toUpperCase()}${path}${sortedQuery}${bodyStr}${timestamp}${nonce}${this.origin}`;

    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(stringToSign)
      .digest('hex');

    return {
      'x-zo-key': this.apiKey,
      'x-zo-timestamp': timestamp,
      'x-zo-nonce': nonce,
      'x-zo-origin': this.origin,
      'x-zo-signature': signature,
      'x-zo-version': '1.0',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Step 1 of Mobile Money Collection: Create Quote
   * POST /api/v1/wallets/quote
   */
  async createCollectionQuote(
    params: ZoPayQuoteRequest,
  ): Promise<ZoPayQuoteResponse> {
    const path = '/api/v1/wallets/quote';

    if (!this.isConfigured) {
      this.logger.log(
        `[SIMULATION] ZoPay createCollectionQuote: ${params.gateway} ${params.amount} ${params.currency} for ${params.payer.msisdn}`,
      );
      return {
        quote_id: `mock-quote-${crypto.randomUUID()}`,
        fees: {
          gateway_fee: '50.00',
          platform_fee: '100.00',
        },
        total_amount: (parseFloat(params.amount) + 150).toFixed(2),
        net_to_merchant: params.amount,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    }

    const headers = this.generateHeaders('POST', path, params as unknown as Record<string, unknown>);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `ZoPay createCollectionQuote failed [${response.status}]: ${errorText}`,
      );
      throw new Error(
        `ZoPay Quote Error: ${response.status} - ${errorText || response.statusText}`,
      );
    }

    return (await response.json()) as ZoPayQuoteResponse;
  }

  /**
   * Step 2 of Mobile Money Collection: Execute Collection
   * POST /api/v1/wallets/collect
   */
  async executeCollection(
    params: ZoPayCollectRequest,
  ): Promise<ZoPayCollectResponse> {
    const path = '/api/v1/wallets/collect';

    if (!this.isConfigured) {
      this.logger.log(
        `[SIMULATION] ZoPay executeCollection with quote ${params.quote_id} idempotencyKey ${params.idempotency_key}`,
      );
      return {
        transaction_id: `mock-txn-${crypto.randomUUID()}`,
        status: 'VERIFYING',
        gateway_reference: `SIM_REF_${Date.now()}`,
        correlation_id: `corr-${crypto.randomUUID()}`,
      };
    }

    const headers = this.generateHeaders('POST', path, params as unknown as Record<string, unknown>);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `ZoPay executeCollection failed [${response.status}]: ${errorText}`,
      );
      throw new Error(
        `ZoPay Collect Error: ${response.status} - ${errorText || response.statusText}`,
      );
    }

    return (await response.json()) as ZoPayCollectResponse;
  }

  /**
   * Hosted Checkout Session for Card or Multi-gateway redirect
   * POST /api/v1/checkout/sessions
   */
  async createHostedCheckoutSession(
    params: ZoPayCheckoutSessionRequest,
  ): Promise<ZoPayCheckoutSessionResponse> {
    const path = '/api/v1/checkout/sessions';

    if (!this.isConfigured) {
      const mockId = `mock-session-${crypto.randomUUID()}`;
      this.logger.log(
        `[SIMULATION] ZoPay createHostedCheckoutSession: ${params.amount} ${params.currency}`,
      );
      return {
        checkoutSession: {
          id: mockId,
          checkoutUrl: `https://checkout.zopay.co/pay/${mockId}`,
          amount: params.amount,
          currency: params.currency,
          status: 'PENDING',
        },
      };
    }

    const headers = this.generateHeaders('POST', path, params as unknown as Record<string, unknown>);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `ZoPay createHostedCheckoutSession failed [${response.status}]: ${errorText}`,
      );
      throw new Error(
        `ZoPay Checkout Session Error: ${response.status} - ${errorText || response.statusText}`,
      );
    }

    return (await response.json()) as ZoPayCheckoutSessionResponse;
  }

  /**
   * Get Transaction Status
   * GET /api/v1/wallets/transactions/:id
   */
  async getTransactionStatus(
    transactionId: string,
  ): Promise<ZoPayTransactionStatusResponse> {
    const path = `/api/v1/wallets/transactions/${transactionId}`;

    if (!this.isConfigured || transactionId.startsWith('mock-')) {
      this.logger.log(
        `[SIMULATION] ZoPay getTransactionStatus for ${transactionId}`,
      );
      return {
        transaction: {
          id: transactionId,
          gateway: 'MTN_MOMO',
          amount: '5000.00',
          currency: 'XAF',
          status: 'SUCCESS',
          gatewayReference: `SIM_GATEWAY_REF_${Date.now()}`,
          completedAt: new Date().toISOString(),
        },
      };
    }

    const headers = this.generateHeaders('GET', path);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `ZoPay getTransactionStatus failed [${response.status}]: ${errorText}`,
      );
      throw new Error(
        `ZoPay Transaction Status Error: ${response.status} - ${errorText || response.statusText}`,
      );
    }

    return (await response.json()) as ZoPayTransactionStatusResponse;
  }

  /**
   * Verify Webhook Signature according to ZoPay Docs:
   * - Headers: x-zo-signature, x-zo-timestamp (in ms)
   * - String to sign: `${timestamp}.${rawBody}`
   * - Expected: HMAC-SHA256(WEBHOOK_SECRET, stringToSign) in hex
   * - Timing-safe comparison
   * - Timestamp freshness check (<= 5 minutes)
   */
  verifyWebhookSignature(
    rawPayload: string | Buffer,
    signature: string,
    timestamp?: string,
  ): boolean {
    if (!signature) {
      this.logger.warn('Webhook signature missing');
      return false;
    }

    const secret = this.webhookSecret;
    if (!secret) {
      if (!this.isConfigured) {
        this.logger.warn(
          'ZoPay webhook secret not configured; skipping validation in simulation mode',
        );
        return true;
      }
      this.logger.error('ZOPAY_WEBHOOK_SECRET is not configured');
      return false;
    }

    // Check timestamp freshness if provided
    if (timestamp) {
      const parsedTime = parseInt(timestamp, 10);
      if (!isNaN(parsedTime)) {
        const now = Date.now();
        const age = Math.abs(now - parsedTime);
        if (age > 5 * 60 * 1000) {
          this.logger.warn(`Webhook request rejected: timestamp age ${age}ms exceeds 5 minutes`);
          return false;
        }
      }
    }

    const payloadString =
      typeof rawPayload === 'string'
        ? rawPayload
        : rawPayload.toString('utf8');

    // Formula per ZoPay Webhook Security docs:
    // If timestamp is sent in header, stringToSign = `${timestamp}.${payload}`
    // Otherwise fallback to `${payload}`
    const stringToSign = timestamp
      ? `${timestamp}.${payloadString}`
      : payloadString;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(stringToSign)
      .digest('hex');

    const cleanSignature = signature.trim().replace(/^sha256=/i, '');

    if (expectedSignature.length !== cleanSignature.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(cleanSignature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  // IPaymentProvider contract implementation
  async initiatePayment(
    payload: InitiatePaymentPayload,
  ): Promise<PaymentInitiationResult> {
    const isMomo =
      payload.description.includes('MTN') ||
      payload.description.includes('MoMo');
    const gateway = isMomo ? 'MTN_MOMO' : 'ORANGE_MONEY';

    if (payload.customerPhone) {
      const quote = await this.createCollectionQuote({
        gateway,
        transaction_type: 'COLLECTION',
        amount: payload.amount.toString(),
        currency: payload.currency,
        payer: {
          msisdn: payload.customerPhone,
        },
      });

      const collect = await this.executeCollection({
        quote_id: quote.quote_id,
        idempotency_key: payload.reference,
      });

      return {
        providerReference: collect.transaction_id,
        status: collect.status === 'SUCCESS' ? 'processing' : 'pending',
        ussdCode: `*126# / #150#`,
        raw: { quote, collect },
      };
    }

    // Hosted checkout session fallback
    const session = await this.createHostedCheckoutSession({
      amount: payload.amount.toString(),
      currency: payload.currency,
      description: payload.description,
      metadata: { reference: payload.reference },
    });

    return {
      providerReference: session.checkoutSession.id,
      status: 'pending',
      redirectUrl: session.checkoutSession.checkoutUrl,
      raw: session,
    };
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    const res = await this.getTransactionStatus(reference);
    const txn = res.transaction;
    return {
      providerReference: txn.id,
      internalReference: reference,
      status:
        txn.status === 'SUCCESS'
          ? 'success'
          : txn.status === 'FAILED' || txn.status === 'CANCELLED'
          ? 'failed'
          : 'pending',
      amount: parseFloat(txn.amount),
      currency: txn.currency,
      paidAt: txn.completedAt ? new Date(txn.completedAt) : undefined,
      raw: res,
    };
  }
}

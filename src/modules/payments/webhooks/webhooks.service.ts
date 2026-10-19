import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LifecycleService } from '../../mentorship/lifecycle/lifecycle.service';

export interface ZoPayWebhookEvent {
  event: string;
  data: {
    transaction_id?: string;
    id?: string;
    amount?: string | number;
    currency?: string;
    gateway?: string;
    failure_reason?: string;
    metadata?: Record<string, string>;
    [key: string]: unknown;
  };
  timestamp?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly processedDeliveryIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleService: LifecycleService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process incoming webhook event with idempotency guarantees
   */
  async handleZoPayWebhook(payload: ZoPayWebhookEvent, deliveryId?: string) {
    this.logger.log(
      `Received webhook event: ${payload.event} (delivery: ${deliveryId || 'none'})`,
    );

    // 1. Delivery ID deduplication (in-memory / short-term guard)
    if (deliveryId) {
      if (this.processedDeliveryIds.has(deliveryId)) {
        this.logger.log(`Duplicate webhook delivery ignored: ${deliveryId}`);
        return { received: true, deduplicated: true };
      }
      this.processedDeliveryIds.add(deliveryId);

      // Keep cache size bounded
      if (this.processedDeliveryIds.size > 10000) {
        this.processedDeliveryIds.clear();
      }
    }

    const event = payload.event;
    const data = payload.data || {};
    const transactionId = data.transaction_id || data.id;
    const metadataPaymentId = data.metadata?.paymentId;
    const metadataMentorshipId = data.metadata?.mentorshipId;

    if (!transactionId && !metadataPaymentId && !metadataMentorshipId) {
      this.logger.warn('Webhook payload contains no identifier for payment matching');
      return { received: true, ignored: true, reason: 'No identifier found' };
    }

    // 2. Find matching payment record
    let payment: any = null;
    if (metadataPaymentId) {
      payment = await this.prisma.payment.findUnique({
        where: { id: metadataPaymentId },
        include: { mentorship: true },
      });
    }

    if (!payment && transactionId) {
      payment = await this.prisma.payment.findFirst({
        where: { providerReference: transactionId },
        include: { mentorship: true },
      });
    }

    if (!payment && metadataMentorshipId) {
      payment = await this.prisma.payment.findFirst({
        where: {
          mentorshipId: metadataMentorshipId,
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
        include: { mentorship: true },
      });
    }

    if (!payment) {
      this.logger.warn(
        `No payment record matched for transaction ${transactionId || metadataPaymentId || metadataMentorshipId}`,
      );
      return { received: true, unmapped: true };
    }

    // 3. Handle Payment Succeeded
    if (event === 'payment.succeeded') {
      // Idempotency: if already SUCCESS, no-op
      if (payment.status === 'SUCCESS') {
        this.logger.log(`Payment ${payment.id} already marked SUCCESS (idempotent callback)`);
        return { received: true, status: 'SUCCESS', alreadyProcessed: true };
      }

      this.logger.log(
        `Marking payment ${payment.id} as SUCCESS and activating mentorship ${payment.mentorshipId}`,
      );

      // Update payment status
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          providerReference: transactionId || payment.providerReference,
        },
      });

      // Activate mentorship if currently INTRO
      if (payment.mentorship.status === 'INTRO') {
        try {
          await this.lifecycleService.activateMentorship(
            payment.mentorshipId,
            payment.userId,
            'mentee',
          );
          this.logger.log(
            `Mentorship ${payment.mentorshipId} successfully transitioned from INTRO to ACTIVE`,
          );
        } catch (actErr) {
          this.logger.error(
            `Failed to activate mentorship ${payment.mentorshipId}: ${(actErr as Error).message}`,
          );
        }
      }

      // Emit domain event
      this.eventEmitter.emit('mentorship.payment.succeeded', {
        paymentId: payment.id,
        mentorshipId: payment.mentorshipId,
        userId: payment.userId,
        amount: Number(payment.amount),
        currency: payment.currency,
        provider: payment.provider,
        providerReference: transactionId || payment.providerReference,
      });

      return { received: true, status: 'SUCCESS', activated: true };
    }

    // 4. Handle Payment Failed
    if (event === 'payment.failed') {
      this.logger.warn(
        `Payment ${payment.id} failed: ${data.failure_reason || 'Unknown error'}`,
      );

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          providerReference: transactionId || payment.providerReference,
        },
      });

      this.eventEmitter.emit('mentorship.payment.failed', {
        paymentId: payment.id,
        mentorshipId: payment.mentorshipId,
        userId: payment.userId,
        reason: data.failure_reason,
      });

      return { received: true, status: 'FAILED' };
    }

    this.logger.log(`Unhandled webhook event type: ${event}`);
    return { received: true, unhandled: event };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LifecycleService } from '../../mentorship/lifecycle/lifecycle.service';
import { ZopayAdapter } from '../providers/adapters/zopay.adapter';
import {
  InitiatePaymentDto,
  PaymentMethodProvider,
} from './dto/initiate-payment.dto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly zopayAdapter: ZopayAdapter,
    private readonly lifecycleService: LifecycleService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  /**
   * Helper to normalize Cameroonian / regional phone numbers to E.164
   */
  private normalizePhoneNumber(phone: string): string {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    if (cleaned.startsWith('237') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('2'))) {
      return `+237${cleaned}`;
    }
    return `+${cleaned}`;
  }

  /**
   * Format payment object safely converting BigInt to Number
   */
  private formatPayment(payment: any) {
    return {
      ...payment,
      amount: typeof payment.amount === 'bigint' ? Number(payment.amount) : payment.amount,
    };
  }

  /**
   * Initiate payment for an accepted mentorship in INTRO status
   */
  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    // 1. Retrieve mentorship and verify ownership
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: dto.mentorshipId },
      include: {
        plan: true,
        mentor: true,
        mentee: {
          select: {
            id: true,
            email: true,
            menteeProfile: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!mentorship) {
      throw new NotFoundException(`Mentorship ${dto.mentorshipId} not found`);
    }

    if (mentorship.menteeId !== userId) {
      throw new ForbiddenException(
        'You can only initiate payment for your own mentorships.',
      );
    }

    // 2. Verify mentorship.status === 'INTRO'
    if (mentorship.status !== 'INTRO') {
      throw new BadRequestException(
        `Cannot initiate payment for mentorship with status '${mentorship.status}'. Only INTRO mentorships can be activated.`,
      );
    }

    if (!mentorship.plan) {
      throw new BadRequestException('Associated mentorship plan was not found.');
    }

    // 3. Extract price and currency
    const priceAmount = Number(mentorship.plan.priceAmount);
    if (isNaN(priceAmount) || priceAmount <= 0) {
      throw new BadRequestException('Mentorship plan price is invalid.');
    }
    const currency = mentorship.plan.currency || 'XAF';

    // 4. Create initial PENDING payment record
    const payment = await this.prisma.payment.create({
      data: {
        mentorshipId: mentorship.id,
        userId,
        amount: BigInt(Math.round(priceAmount)),
        currency,
        provider: dto.provider,
        status: 'PENDING',
      },
    });

    this.logger.log(
      `Initiating payment ${payment.id} for mentorship ${mentorship.id} (${priceAmount} ${currency}) via ${dto.provider}`,
    );

    try {
      // 5. Delegate transaction to ZoPay adapter
      if (
        dto.provider === PaymentMethodProvider.MTN_MOMO ||
        dto.provider === PaymentMethodProvider.ORANGE_MONEY
      ) {
        if (!dto.phoneNumber) {
          throw new BadRequestException(
            'Phone number is required for Mobile Money payments.',
          );
        }

        const normalizedPhone = this.normalizePhoneNumber(dto.phoneNumber);
        const gateway =
          dto.provider === PaymentMethodProvider.MTN_MOMO
            ? 'MTN_MOMO'
            : 'ORANGE_MONEY';

        // Step 1: Create Quote
        const quote = await this.zopayAdapter.createCollectionQuote({
          gateway,
          transaction_type: 'COLLECTION',
          amount: priceAmount.toString(),
          currency,
          payer: {
            msisdn: normalizedPhone,
          },
        });

        // Step 2: Execute Collection
        const collect = await this.zopayAdapter.executeCollection({
          quote_id: quote.quote_id,
          idempotency_key: payment.id,
        });

        // Update payment with provider reference
        const updatedPayment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerReference: collect.transaction_id,
            status: collect.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
          },
        });

        // If instantly succeeded (e.g. simulation), activate mentorship immediately
        if (collect.status === 'SUCCESS') {
          await this.lifecycleService.activateMentorship(
            mentorship.id,
            mentorship.menteeId,
            'mentee',
          );
        }

        return {
          paymentId: updatedPayment.id,
          status: updatedPayment.status,
          provider: dto.provider,
          providerReference: collect.transaction_id,
          instructions:
            gateway === 'MTN_MOMO'
              ? `A prompt has been sent to ${normalizedPhone}. Please check your phone and enter your MTN MoMo PIN to approve.`
              : `A prompt has been sent to ${normalizedPhone}. Please check your phone and enter your Orange Money PIN to approve.`,
          quote: {
            totalAmount: quote.total_amount,
            fees: quote.fees,
            expiresAt: quote.expires_at,
          },
        };
      }

      /*
      // Hosted Card / Multi-gateway Checkout flow (Commented out for now - using Mobile Money via ZoPay)
      const returnUrl =
        dto.returnUrl ||
        `${this.frontendUrl}/mentee/dashboard/mentorships/${mentorship.id}/checkout`;

      const menteeName = mentorship.mentee.menteeProfile?.fullName || 'Mentee';
      const mentorName = mentorship.mentor.fullName || 'Mentor';

      const session = await this.zopayAdapter.createHostedCheckoutSession({
        amount: priceAmount.toString(),
        currency,
        description: `Mentorship: ${mentorship.plan.title} with ${mentorName}`,
        gateways: ['MTN_MOMO', 'ORANGE_MONEY'],
        successUrl: `${returnUrl}?paymentId=${payment.id}&status=success`,
        cancelUrl: `${returnUrl}?paymentId=${payment.id}&status=cancel`,
        metadata: {
          mentorshipId: mentorship.id,
          paymentId: payment.id,
          menteeId: userId,
        },
        customer: {
          name: menteeName,
          email: mentorship.mentee.email,
          phone: dto.phoneNumber ? this.normalizePhoneNumber(dto.phoneNumber) : undefined,
        },
      });

      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerReference: session.checkoutSession.id,
        },
      });

      return {
        paymentId: updatedPayment.id,
        status: updatedPayment.status,
        provider: dto.provider,
        providerReference: session.checkoutSession.id,
        checkoutUrl: session.checkoutSession.checkoutUrl,
        instructions: 'Please complete your payment on the secure ZoPay payment portal.',
      };
      */

      throw new BadRequestException(
        'Only MTN Mobile Money and Orange Money payments are supported at this time.',
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Payment initiation failed: ${error.message}`, error.stack);
      // Mark payment as FAILED
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException(
        error.message || 'Payment initiation failed. Please try again.',
      );
    }
  }

  /**
   * Get payment status and poll ZoPay if still pending
   */
  async getPaymentStatus(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        mentorship: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    if (payment.userId !== userId) {
      throw new ForbiddenException(
        'You can only access status for your own payments.',
      );
    }

    // If already marked SUCCESS or FAILED in database
    if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
      return {
        paymentId: payment.id,
        status: payment.status,
        provider: payment.provider,
        providerReference: payment.providerReference,
        mentorshipId: payment.mentorshipId,
        mentorshipStatus: payment.mentorship.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        createdAt: payment.createdAt,
      };
    }

    // If PENDING and has a providerReference, check with ZoPay gateway
    if (payment.providerReference) {
      try {
        const result = await this.zopayAdapter.getTransactionStatus(
          payment.providerReference,
        );

        if (result?.transaction?.status === 'SUCCESS') {
          // Update DB record
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'SUCCESS' },
          });

          // If mentorship is still INTRO, activate it!
          if (payment.mentorship.status === 'INTRO') {
            await this.lifecycleService.activateMentorship(
              payment.mentorshipId,
              payment.userId,
              'mentee',
            );
          }

          this.eventEmitter.emit('mentorship.payment.succeeded', {
            paymentId: payment.id,
            mentorshipId: payment.mentorshipId,
            userId: payment.userId,
          });

          return {
            paymentId: payment.id,
            status: 'SUCCESS',
            provider: payment.provider,
            providerReference: payment.providerReference,
            mentorshipId: payment.mentorshipId,
            mentorshipStatus: 'ACTIVE',
            amount: Number(payment.amount),
            currency: payment.currency,
            createdAt: payment.createdAt,
          };
        } else if (
          result?.transaction?.status === 'FAILED' ||
          result?.transaction?.status === 'CANCELLED'
        ) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED' },
          });

          return {
            paymentId: payment.id,
            status: 'FAILED',
            provider: payment.provider,
            providerReference: payment.providerReference,
            mentorshipId: payment.mentorshipId,
            mentorshipStatus: payment.mentorship.status,
            amount: Number(payment.amount),
            currency: payment.currency,
            createdAt: payment.createdAt,
          };
        }
      } catch (checkErr) {
        this.logger.warn(
          `Status check from ZoPay gateway failed for ${payment.providerReference}: ${(checkErr as Error).message}`,
        );
      }
    }

    return {
      paymentId: payment.id,
      status: payment.status,
      provider: payment.provider,
      providerReference: payment.providerReference,
      mentorshipId: payment.mentorshipId,
      mentorshipStatus: payment.mentorship.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      createdAt: payment.createdAt,
    };
  }
}

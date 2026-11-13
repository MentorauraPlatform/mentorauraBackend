import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailService } from './email.service';
import { InAppService } from '../in-app/in-app.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class BookingNotificationsListener {
  private readonly logger = new Logger(BookingNotificationsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly inAppService: InAppService,
  ) {}

  @OnEvent('mentorship.booking.confirmed')
  async handleBookingConfirmed(payload: {
    bookingId: string;
    mentorshipId: string;
    mentorId: string;
    menteeId: string;
    scheduledAt: Date;
    meetingLink: string;
  }) {
    this.logger.log(
      `Handling booking.confirmed for booking ${payload.bookingId}`,
    );

    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        mentee: {
          select: {
            id: true,
            email: true,
            menteeProfile: { select: { fullName: true } },
          },
        },
        mentor: {
          select: {
            id: true,
            userId: true,
            fullName: true,
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!booking) return;

    const menteeName =
      booking.mentee.menteeProfile?.fullName ||
      booking.mentee.email.split('@')[0];
    const mentorName = booking.mentor.fullName;

    // 1. In-App Notifications
    await Promise.all([
      this.inAppService.create({
        userId: booking.menteeId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Session Booking Confirmed',
        message: `Your session with ${mentorName} is confirmed for ${new Date(payload.scheduledAt).toUTCString()}.`,
        data: {
          bookingId: payload.bookingId,
          meetingLink: payload.meetingLink,
        },
      }),
      this.inAppService.create({
        userId: booking.mentor.userId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'New Session Booked',
        message: `${menteeName} booked a session with you for ${new Date(payload.scheduledAt).toUTCString()}.`,
        data: {
          bookingId: payload.bookingId,
          meetingLink: payload.meetingLink,
        },
      }),
    ]);

    // 2. Transactional Emails
    if (booking.mentee.email) {
      void this.emailService.sendBookingConfirmation(
        booking.mentee.email,
        menteeName,
        mentorName,
        new Date(payload.scheduledAt),
        payload.meetingLink,
      );
    }

    if (booking.mentor.user?.email) {
      void this.emailService.sendBookingConfirmation(
        booking.mentor.user.email,
        mentorName,
        menteeName,
        new Date(payload.scheduledAt),
        payload.meetingLink,
      );
    }
  }

  @OnEvent('mentorship.booking.cancelled')
  async handleBookingCancelled(payload: {
    bookingId: string;
    mentorshipId: string;
    mentorId: string;
    menteeId: string;
    cancelledBy: string;
    isLateCancellation: boolean;
    reason: string;
  }) {
    this.logger.log(
      `Handling booking.cancelled for booking ${payload.bookingId}`,
    );

    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        mentee: {
          select: {
            id: true,
            email: true,
            menteeProfile: { select: { fullName: true } },
          },
        },
        mentor: {
          select: {
            id: true,
            userId: true,
            fullName: true,
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!booking) return;

    const menteeName =
      booking.mentee.menteeProfile?.fullName ||
      booking.mentee.email.split('@')[0];
    const mentorName = booking.mentor.fullName;

    // In-App Notifications
    await Promise.all([
      this.inAppService.create({
        userId: booking.menteeId,
        type: NotificationType.BOOKING_CANCELLED,
        title: 'Session Cancelled',
        message: `Your session with ${mentorName} scheduled for ${new Date(booking.scheduledAt).toUTCString()} was cancelled. Reason: ${payload.reason}`,
        data: { bookingId: payload.bookingId },
      }),
      this.inAppService.create({
        userId: booking.mentor.userId,
        type: NotificationType.BOOKING_CANCELLED,
        title: 'Session Cancelled',
        message: `Session with ${menteeName} scheduled for ${new Date(booking.scheduledAt).toUTCString()} was cancelled. Reason: ${payload.reason}`,
        data: { bookingId: payload.bookingId },
      }),
    ]);

    // Transactional Emails
    if (booking.mentee.email) {
      void this.emailService.sendBookingCancellation(
        booking.mentee.email,
        menteeName,
        mentorName,
        new Date(booking.scheduledAt),
        payload.reason,
      );
    }

    if (booking.mentor.user?.email) {
      void this.emailService.sendBookingCancellation(
        booking.mentor.user.email,
        mentorName,
        menteeName,
        new Date(booking.scheduledAt),
        payload.reason,
      );
    }
  }

  @OnEvent('mentorship.booking.completed')
  async handleBookingCompleted(payload: {
    bookingId: string;
    mentorshipId: string;
    mentorId: string;
    menteeId: string;
    completedAt: Date;
  }) {
    this.logger.log(
      `Handling booking.completed for booking ${payload.bookingId}`,
    );

    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        mentor: { select: { fullName: true } },
      },
    });

    if (!booking) return;

    // Prompt mentee to leave a review
    await this.inAppService.create({
      userId: payload.menteeId,
      type: NotificationType.BOOKING_COMPLETED,
      title: 'Session Completed 🎉',
      message: `Your mentorship session with ${booking.mentor.fullName} is complete. Share your feedback by submitting a review!`,
      data: {
        bookingId: payload.bookingId,
        mentorshipId: payload.mentorshipId,
        mentorId: payload.mentorId,
      },
    });
  }

  @OnEvent('mentorship.booking.no_show')
  async handleBookingNoShow(payload: {
    bookingId: string;
    mentorshipId: string;
    mentorId: string;
    menteeId: string;
    reportedBy: string;
    reason: string;
  }) {
    this.logger.log(
      `Handling booking.no_show for booking ${payload.bookingId}`,
    );

    const mentorProfile = await this.prisma.mentorProfile.findUnique({
      where: { id: payload.mentorId },
      select: { userId: true },
    });
    const mentorUserId = mentorProfile?.userId;

    await Promise.all([
      this.inAppService.create({
        userId: payload.menteeId,
        type: NotificationType.BOOKING_NO_SHOW,
        title: 'Session Flagged as No-Show',
        message: `Your session was marked as a no-show (${payload.reportedBy}). Support has been notified.`,
        data: { bookingId: payload.bookingId, reason: payload.reason },
      }),
      ...(mentorUserId
        ? [
            this.inAppService.create({
              userId: mentorUserId,
              type: NotificationType.BOOKING_NO_SHOW,
              title: 'Session Flagged as No-Show',
              message: `The session was marked as a no-show (${payload.reportedBy}).`,
              data: { bookingId: payload.bookingId, reason: payload.reason },
            }),
          ]
        : []),
    ]);
  }
}

import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma, BookingStatus } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(menteeId: string, dto: { mentorshipId: string; scheduledAt: string; durationMinutes?: number }) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: dto.mentorshipId },
      include: { plan: true, mentor: true },
    });

    if (!mentorship) {
      throw new NotFoundException('Mentorship not found');
    }

    if (mentorship.menteeId !== menteeId) {
      throw new ForbiddenException('You are not authorized to book this mentorship');
    }

    if (mentorship.status !== 'INTRO' && mentorship.status !== 'ACTIVE') {
      throw new BadRequestException('Mentorship is not open for booking');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt datetime');
    }

    const durationMinutes = dto.durationMinutes ?? 60;

    const meetingLink = `https://meet.mentoraura.com/room/session-${crypto.randomUUID()}`;

    const booking = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findFirst({
        where: {
          mentorId: mentorship.mentorId,
          scheduledAt,
          status: { in: [BookingStatus.SCHEDULED] },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('This time slot was just booked by another user');
      }

      return tx.booking.create({
        data: {
          mentorshipId: mentorship.id,
          mentorId: mentorship.mentorId,
          menteeId,
          scheduledAt,
          durationMinutes,
          meetingLink,
          status: BookingStatus.SCHEDULED,
        },
        include: {
          mentorship: { include: { plan: true, mentor: true, mentee: true } },
        },
      });
    });

    return { data: booking };
  }

  async findMenteeBookings(menteeId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { menteeId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        mentorship: {
          include: {
            plan: { select: { id: true, title: true, priceAmount: true, currency: true } },
            mentor: { select: { id: true, fullName: true, title: true } },
          },
        },
      },
    });

    return { data: bookings };
  }

  async findMentorBookings(userId: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor profile not found');
    }

    const bookings = await this.prisma.booking.findMany({
      where: { mentorId: mentor.id },
      orderBy: { scheduledAt: 'desc' },
      include: {
        mentee: { select: { id: true, email: true } },
        mentorship: {
          include: {
            plan: { select: { id: true, title: true, priceAmount: true, currency: true } },
          },
        },
      },
    });

    return { data: bookings };
  }

  async findOne(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        mentee: { select: { id: true, email: true } },
        mentor: { select: { id: true, fullName: true } },
        mentorship: {
          include: {
            plan: { select: { id: true, title: true, priceAmount: true, currency: true } },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.menteeId !== userId) {
      const mentor = await this.prisma.mentorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!mentor || booking.mentorId !== mentor.id) {
        throw new ForbiddenException('You are not authorized to view this booking');
      }
    }

    return booking;
  }

  async cancelBooking(bookingId: string, userId: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.menteeId !== userId) {
      const mentor = await this.prisma.mentorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!mentor || booking.mentorId !== mentor.id) {
        throw new ForbiddenException('You are not authorized to cancel this booking');
      }
    }

    if (booking.status !== BookingStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled bookings can be cancelled');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: reason,
      },
      include: {
        mentorship: { include: { plan: true, mentor: true, mentee: true } },
      },
    });

    return { data: updated };
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma, BookingStatus } from '@prisma/client';
import {
  CreateBookingDto,
  CancelBookingDto,
  NoShowBookingDto,
} from './dto/booking.dto';
import { CalendarService } from '../calendar/calendar.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly calendarService: CalendarService,
  ) {}

  private readonly safeMentorshipInclude = {
    plan: true,
    mentor: true,
    mentee: {
      select: {
        id: true,
        email: true,
        role: true,
        isMentor: true,
        menteeProfile: { select: { fullName: true, avatarUrl: true } },
      },
    },
  };

  /**
   * Create a new booking slot
   */
  async createBooking(menteeId: string, dto: CreateBookingDto) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: dto.mentorshipId },
      include: {
        plan: true,
        mentor: {
          include: {
            user: { select: { email: true } },
          },
        },
        mentee: {
          include: {
            menteeProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!mentorship) {
      throw new NotFoundException('Mentorship not found');
    }

    if (mentorship.menteeId !== menteeId) {
      throw new ForbiddenException(
        'You are not authorized to book this mentorship',
      );
    }

    if (mentorship.status !== 'INTRO' && mentorship.status !== 'ACTIVE') {
      throw new BadRequestException('Mentorship is not open for booking');
    }

    if (
      !mentorship.mentor.isVerified ||
      mentorship.mentor.onboardingStatus !== 'COMPLETE'
    ) {
      throw new BadRequestException(
        'Mentor is not currently verified or available for bookings',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt datetime');
    }

    // Advance notice enforcement: at least 2 hours in advance
    const minNoticeMs = 2 * 60 * 60 * 1000;
    if (scheduledAt.getTime() < Date.now() + minNoticeMs) {
      throw new BadRequestException(
        'Bookings must be scheduled at least 2 hours in advance to give mentors sufficient preparation time.',
      );
    }

    // Check blackout dates (both UTC date and mentor's timezone local date)
    const rawAvail =
      (mentorship.mentor.availability as Record<string, any> | null) ?? null;
    const mentorTimezone =
      (rawAvail &&
        typeof rawAvail.timezone === 'string' &&
        rawAvail.timezone) ||
      'UTC';
    let mentorLocalDateStr = scheduledAt.toISOString().split('T')[0];
    try {
      mentorLocalDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: mentorTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(scheduledAt);
    } catch {
      // Fallback to UTC date string
    }
    const utcDateOnly = new Date(scheduledAt.toISOString().split('T')[0]);
    const localDateOnly = new Date(mentorLocalDateStr);
    const isBlackedOut = await this.prisma.blackoutDate.findFirst({
      where: {
        mentorProfileId: mentorship.mentorId,
        date: { in: [utcDateOnly, localDateOnly] },
      },
    });

    if (isBlackedOut) {
      throw new BadRequestException(
        `The mentor has declared this day as unavailable: ${isBlackedOut.reason || 'Blackout date'}`,
      );
    }

    const durationMinutes = dto.durationMinutes ?? 60;

    // Validate against mentor's configured recurring availability windows if configured
    if (rawAvail && typeof rawAvail === 'object') {
      const normalizedWindows: Array<{
        day: string;
        startTime: string;
        endTime: string;
      }> = [];
      const dayAliases: Record<string, string> = {
        monday: 'monday',
        mon: 'monday',
        tuesday: 'tuesday',
        tue: 'tuesday',
        wednesday: 'wednesday',
        wed: 'wednesday',
        thursday: 'thursday',
        thu: 'thursday',
        friday: 'friday',
        fri: 'friday',
        saturday: 'saturday',
        sat: 'saturday',
        sunday: 'sunday',
        sun: 'sunday',
      };
      if (Array.isArray(rawAvail.slots)) {
        for (const s of rawAvail.slots) {
          if (s && s.day && s.startTime && s.endTime) {
            const dKey =
              dayAliases[String(s.day).toLowerCase()] ??
              String(s.day).toLowerCase();
            normalizedWindows.push({
              day: dKey,
              startTime: String(s.startTime),
              endTime: String(s.endTime),
            });
          }
        }
      } else {
        for (const dKey of [
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ]) {
          const arr = rawAvail[dKey];
          if (Array.isArray(arr)) {
            for (const w of arr) {
              if (w && (w.start || w.startTime) && (w.end || w.endTime)) {
                normalizedWindows.push({
                  day: dKey,
                  startTime: String(w.start || w.startTime),
                  endTime: String(w.end || w.endTime),
                });
              }
            }
          }
        }
      }

      if (normalizedWindows.length > 0) {
        let targetDayName = scheduledAt
          .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
          .toLowerCase();
        let localMinutesFromMidnight =
          scheduledAt.getUTCHours() * 60 + scheduledAt.getUTCMinutes();
        try {
          targetDayName = scheduledAt
            .toLocaleDateString('en-US', {
              weekday: 'long',
              timeZone: mentorTimezone,
            })
            .toLowerCase();
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: mentorTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).formatToParts(scheduledAt);
          const h =
            Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
          const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
          localMinutesFromMidnight = h * 60 + m;
        } catch {
          // Use UTC fallback
        }
        const reqEndMinutes = localMinutesFromMidnight + durationMinutes;
        const matchesWindow = normalizedWindows.some((w) => {
          if (w.day !== targetDayName) return false;
          const [sh, sm] = w.startTime.split(':').map(Number);
          const [eh, em] = w.endTime.split(':').map(Number);
          const winStart = sh * 60 + sm;
          const winEnd = eh * 60 + em;
          return (
            localMinutesFromMidnight >= winStart && reqEndMinutes <= winEnd
          );
        });

        if (!matchesWindow) {
          throw new BadRequestException(
            'The requested time slot is outside the mentor’s configured availability hours.',
          );
        }
      }
    }

    const mentorEmail = mentorship.mentor?.user?.email || '';
    const menteeEmail = mentorship.mentee?.email || '';
    const mentorName = mentorship.mentor?.fullName || 'Mentor';
    const menteeName =
      mentorship.mentee?.menteeProfile?.fullName ||
      menteeEmail.split('@')[0] ||
      'Mentee';
    const planTitle =
      mentorship.plan?.title ||
      (mentorship.status === 'INTRO'
        ? 'Complimentary Intro Session'
        : 'Mentorship Session');

    const meetingResult = await this.calendarService.createMeeting({
      summary: `Mentorship: ${mentorName} & ${menteeName} (${planTitle})`,
      description: `1-on-1 Mentorship session on MentorAura.\nPlan: ${planTitle}\nMentor: ${mentorName} (${mentorEmail})\nMentee: ${menteeName} (${menteeEmail})`,
      startTime: scheduledAt,
      durationMinutes,
      mentorEmail,
      menteeEmail,
      mentorName,
      menteeName,
    });

    const meetingLink = meetingResult.meetingLink;

    let booking;
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        // Acquire row lock on mentor profile to serialize concurrent booking attempts for the same mentor
        await tx.$queryRaw`SELECT id FROM mentor_profiles WHERE id = ${mentorship.mentorId}::uuid FOR UPDATE`;

        // Check for overlapping non-cancelled bookings within +/- 4 hours
        const windowStart = new Date(
          scheduledAt.getTime() - 4 * 60 * 60 * 1000,
        );
        const windowEnd = new Date(
          scheduledAt.getTime() + (durationMinutes + 240) * 60 * 1000,
        );
        const nearbyScheduled = await tx.booking.findMany({
          where: {
            OR: [
              { mentorId: mentorship.mentorId },
              { mentorId: mentorship.mentor.userId },
            ],
            status: { notIn: [BookingStatus.CANCELLED] },
            scheduledAt: { gte: windowStart, lte: windowEnd },
          },
          select: { id: true, scheduledAt: true, durationMinutes: true },
        });

        const reqStartMs = scheduledAt.getTime();
        const reqEndMs = reqStartMs + durationMinutes * 60 * 1000;
        const hasConflict = nearbyScheduled.some((b) => {
          const bStart = b.scheduledAt.getTime();
          const bEnd = bStart + (b.durationMinutes || 60) * 60 * 1000;
          return bStart < reqEndMs && bEnd > reqStartMs;
        });

        if (hasConflict) {
          throw new ConflictException(
            'This time slot has already been booked for this mentor. Please select another slot.',
          );
        }

        const menteeOverlap = await tx.booking.findMany({
          where: {
            menteeId,
            status: { notIn: [BookingStatus.CANCELLED] },
            scheduledAt: { gte: windowStart, lte: windowEnd },
          },
          select: { id: true, scheduledAt: true, durationMinutes: true },
        });

        const hasMenteeConflict = menteeOverlap.some((b) => {
          const bStart = b.scheduledAt.getTime();
          const bEnd = bStart + (b.durationMinutes || 60) * 60 * 1000;
          return bStart < reqEndMs && bEnd > reqStartMs;
        });

        if (hasMenteeConflict) {
          throw new ConflictException(
            'You already have another session booked at this time.',
          );
        }

        if (mentorship.status === 'INTRO') {
          const introBookingCount = await tx.booking.count({
            where: {
              mentorshipId: mentorship.id,
              OR: [
                { status: { notIn: [BookingStatus.CANCELLED] } },
                {
                  status: BookingStatus.CANCELLED,
                  cancelledBy: 'MENTEE',
                  cancellationReason: {
                    startsWith: '[Late Cancellation < 24h]',
                  },
                },
              ],
            },
          });

          if (introBookingCount >= 1) {
            throw new BadRequestException(
              'Free intro call has already been booked for this mentorship.',
            );
          }
        }

        if (mentorship.status === 'ACTIVE' && mentorship.plan) {
          const monthStart = new Date(scheduledAt);
          monthStart.setUTCDate(1);
          monthStart.setUTCHours(0, 0, 0, 0);

          const monthEnd = new Date(monthStart);
          monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

          const activeMonthBookings = await tx.booking.count({
            where: {
              mentorshipId: mentorship.id,
              scheduledAt: {
                gte: monthStart,
                lt: monthEnd,
              },
              OR: [
                {
                  status: {
                    in: [
                      BookingStatus.SCHEDULED,
                      BookingStatus.COMPLETED,
                      BookingStatus.NO_SHOW,
                    ],
                  },
                },
                {
                  status: BookingStatus.CANCELLED,
                  cancelledBy: 'MENTEE',
                  cancellationReason: {
                    startsWith: '[Late Cancellation < 24h]',
                  },
                },
              ],
            },
          });

          if (activeMonthBookings >= mentorship.plan.sessionsPerMonth) {
            throw new BadRequestException(
              `Session quota reached: you have already booked all ${mentorship.plan.sessionsPerMonth} session(s) included in your ${mentorship.plan.title} plan for this period.`,
            );
          }
        }

        const newBooking = await tx.booking.create({
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
            mentorship: { include: this.safeMentorshipInclude },
          },
        });

        return newBooking;
      });

      // Mirror into Session entity outside the transaction so a failure never aborts the PostgreSQL transaction
      await this.prisma.session
        .create({
          data: {
            id: booking.id,
            mentorshipId: mentorship.id,
            mentorId: mentorship.mentorId,
            menteeId,
            scheduledAt,
            durationMinutes,
            status: BookingStatus.SCHEDULED,
            meetingLink,
          },
        })
        .catch((err) => {
          this.logger.debug(`Session mirror creation notice: ${err?.message}`);
        });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This time slot was just booked by another user',
        );
      }
      throw error;
    }

    this.eventEmitter.emit('mentorship.booking.confirmed', {
      bookingId: booking.id,
      mentorshipId: booking.mentorshipId,
      mentorId: booking.mentorId,
      menteeId: booking.menteeId,
      scheduledAt: booking.scheduledAt,
      durationMinutes: booking.durationMinutes,
      meetingLink: booking.meetingLink,
    });

    return { data: booking };
  }

  async findMenteeBookings(menteeId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { menteeId },
      orderBy: { scheduledAt: 'asc' },
      include: {
        mentorship: {
          include: {
            plan: {
              select: {
                id: true,
                title: true,
                priceAmount: true,
                currency: true,
              },
            },
            mentor: {
              select: {
                id: true,
                fullName: true,
                title: true,
                headline: true,
                company: true,
                slug: true,
                user: { select: { id: true, email: true } },
              },
            },
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
      orderBy: { scheduledAt: 'asc' },
      include: {
        mentee: {
          select: {
            id: true,
            email: true,
            menteeProfile: { select: { fullName: true, avatarUrl: true } },
          },
        },
        mentorship: {
          include: {
            plan: {
              select: {
                id: true,
                title: true,
                priceAmount: true,
                currency: true,
              },
            },
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
        mentor: { select: { id: true, fullName: true, userId: true } },
        mentorship: {
          include: {
            plan: {
              select: {
                id: true,
                title: true,
                priceAmount: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.menteeId !== userId && booking.mentor.userId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view this booking',
      );
    }

    return booking;
  }

  /**
   * Cancel booking with strict notice window policies and audit logging
   */
  async cancelBooking(
    bookingId: string,
    userId: string,
    dto?: CancelBookingDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { mentor: { select: { userId: true, fullName: true } } },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isMentee = booking.menteeId === userId;
    const isMentor = booking.mentor.userId === userId;

    if (!isMentee && !isMentor) {
      throw new ForbiddenException(
        'You are not authorized to cancel this booking',
      );
    }

    if (booking.status !== BookingStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled bookings can be cancelled');
    }

    // Sessions that have already started cannot be cancelled
    if (booking.scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Sessions that have already started or passed cannot be cancelled.',
      );
    }

    const hoursUntilSession =
      (booking.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
    const isLateCancellation = hoursUntilSession < 24;

    const cancelledBy = isMentee ? 'MENTEE' : 'MENTOR';
    const reasonPrefix = isLateCancellation ? '[Late Cancellation < 24h] ' : '';
    const fullReason = `${reasonPrefix}${dto?.reason || 'Cancelled by user'}`;

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: fullReason,
        cancelledBy,
        cancelledAt: new Date(),
      },
      include: {
        mentorship: { include: this.safeMentorshipInclude },
      },
    });

    await this.prisma.session
      .updateMany({
        where: { id: bookingId },
        data: { status: BookingStatus.CANCELLED },
      })
      .catch(() => null);

    this.eventEmitter.emit('mentorship.booking.cancelled', {
      bookingId: updated.id,
      mentorshipId: updated.mentorshipId,
      mentorId: updated.mentorId,
      menteeId: updated.menteeId,
      cancelledBy,
      isLateCancellation,
      reason: fullReason,
    });

    return { data: updated };
  }

  /**
   * Explicitly complete a session (can be initiated by mentor or mentee once session starts)
   */
  async completeBooking(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { mentor: { select: { userId: true, fullName: true } } },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isMentee = booking.menteeId === userId;
    const isMentor = booking.mentor.userId === userId;

    if (!isMentee && !isMentor) {
      throw new ForbiddenException(
        'You are not authorized to complete this booking',
      );
    }

    if (booking.status === BookingStatus.COMPLETED) {
      return { data: booking, message: 'Session is already marked completed' };
    }

    if (booking.status !== BookingStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot complete a session with status ${booking.status}`,
      );
    }

    if (booking.scheduledAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'Cannot mark a future session as completed before its scheduled start time',
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.COMPLETED,
      },
      include: {
        mentorship: { include: this.safeMentorshipInclude },
      },
    });

    await this.prisma.session
      .updateMany({
        where: { id: bookingId },
        data: { status: BookingStatus.COMPLETED },
      })
      .catch(() => null);

    this.eventEmitter.emit('mentorship.booking.completed', {
      bookingId: updated.id,
      mentorshipId: updated.mentorshipId,
      mentorId: updated.mentorId,
      menteeId: updated.menteeId,
      completedAt: new Date(),
    });

    return {
      data: updated,
      message: 'Session successfully marked as completed',
    };
  }

  /**
   * Report no-show for a session
   */
  async reportNoShow(bookingId: string, userId: string, dto: NoShowBookingDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { mentor: { select: { userId: true, fullName: true } } },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isMentee = booking.menteeId === userId;
    const isMentor = booking.mentor.userId === userId;

    if (!isMentee && !isMentor) {
      throw new ForbiddenException(
        'You are not authorized to report no-show for this booking',
      );
    }

    if (booking.status !== BookingStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot report no-show for a booking with status ${booking.status}`,
      );
    }

    // Must be at least 15 minutes past start time
    const minBufferMs = 15 * 60 * 1000;
    if (booking.scheduledAt.getTime() + minBufferMs > Date.now()) {
      throw new BadRequestException(
        'No-show can only be reported at least 15 minutes after session start time',
      );
    }

    const actualReporter = isMentee ? 'MENTEE' : 'MENTOR';
    const reason = `[No-Show reported by ${actualReporter}]: ${dto.reason || 'Did not show up'}`;

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.NO_SHOW,
        cancellationReason: reason,
        cancelledBy: actualReporter,
        cancelledAt: new Date(),
      },
      include: {
        mentorship: { include: this.safeMentorshipInclude },
      },
    });

    await this.prisma.session
      .updateMany({
        where: { id: bookingId },
        data: { status: BookingStatus.NO_SHOW },
      })
      .catch(() => null);

    this.eventEmitter.emit('mentorship.booking.no_show', {
      bookingId: updated.id,
      mentorshipId: updated.mentorshipId,
      mentorId: updated.mentorId,
      menteeId: updated.menteeId,
      reportedBy: actualReporter,
      reason,
    });

    return { data: updated, message: 'Session marked as no-show' };
  }

  /**
   * Automated Cron Sweeper: Transitions past SCHEDULED sessions to COMPLETED
   * Runs every 10 minutes
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepPastScheduledSessions() {
    this.logger.debug(
      'Running session lifecycle sweeper for past scheduled bookings...',
    );

    // A session is considered finished 15 minutes after its scheduled duration ends
    const gracePeriodMinutes = 15;
    const minCutoffTime = new Date(
      Date.now() - (15 + gracePeriodMinutes) * 60 * 1000,
    );

    const candidateBookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.SCHEDULED,
        scheduledAt: { lte: minCutoffTime },
      },
      take: 100,
    });

    const nowMs = Date.now();
    const pastBookings = candidateBookings.filter(
      (b) =>
        b.scheduledAt.getTime() +
          ((b.durationMinutes || 60) + gracePeriodMinutes) * 60 * 1000 <=
        nowMs,
    );

    if (pastBookings.length === 0) {
      return;
    }

    this.logger.log(
      `Found ${pastBookings.length} past scheduled sessions to transition to COMPLETED`,
    );

    const bookingIds = pastBookings.map((b) => b.id);
    try {
      await this.prisma.booking.updateMany({
        where: { id: { in: bookingIds } },
        data: { status: BookingStatus.COMPLETED },
      });

      await this.prisma.session
        .updateMany({
          where: { id: { in: bookingIds } },
          data: { status: BookingStatus.COMPLETED },
        })
        .catch(() => null);
    } catch (err: any) {
      this.logger.error(`Error in batch session completion: ${err?.message}`);
    }

    for (const booking of pastBookings) {
      try {
        this.eventEmitter.emit('mentorship.booking.completed', {
          bookingId: booking.id,
          mentorshipId: booking.mentorshipId,
          mentorId: booking.mentorId,
          menteeId: booking.menteeId,
          autoCompleted: true,
          completedAt: new Date(),
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to emit auto-completion event for booking ${booking.id}: ${err?.message}`,
        );
      }
    }
  }

  async getBookingQuota(userId: string, mentorshipId: string) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: mentorshipId },
      include: {
        plan: true,
        mentor: { include: { user: { select: { email: true } } } },
      },
    });

    if (!mentorship) {
      throw new NotFoundException('Mentorship not found');
    }

    if (mentorship.menteeId !== userId && mentorship.mentor.userId !== userId) {
      throw new ForbiddenException(
        'Not authorized to view this mentorship quota',
      );
    }

    if (mentorship.status === 'INTRO') {
      const introBookings = await this.prisma.booking.count({
        where: {
          mentorshipId,
          status: { notIn: [BookingStatus.CANCELLED] },
        },
      });
      return {
        data: {
          status: 'INTRO',
          isIntro: true,
          totalSessionsAllowed: 1,
          sessionsBooked: introBookings,
          sessionsRemaining: Math.max(0, 1 - introBookings),
          canBook: introBookings < 1,
          planTitle: mentorship.plan?.title || 'Complimentary Intro Session',
        },
      };
    }

    const sessionsAllowed = mentorship.plan?.sessionsPerMonth ?? 1;

    // Current month window
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
    );

    const bookedThisMonth = await this.prisma.booking.count({
      where: {
        mentorshipId,
        scheduledAt: { gte: monthStart, lt: monthEnd },
        OR: [
          {
            status: {
              in: [
                BookingStatus.SCHEDULED,
                BookingStatus.COMPLETED,
                BookingStatus.NO_SHOW,
              ],
            },
          },
          {
            status: BookingStatus.CANCELLED,
            cancelledBy: 'MENTEE',
            cancellationReason: { startsWith: '[Late Cancellation < 24h]' },
          },
        ],
      },
    });

    const sessionsRemaining = Math.max(0, sessionsAllowed - bookedThisMonth);

    return {
      data: {
        status: mentorship.status,
        isIntro: false,
        totalSessionsAllowed: sessionsAllowed,
        sessionsBooked: bookedThisMonth,
        sessionsRemaining,
        canBook: mentorship.status === 'ACTIVE' && sessionsRemaining > 0,
        planTitle: mentorship.plan?.title || 'Mentorship Plan',
      },
    };
  }
}

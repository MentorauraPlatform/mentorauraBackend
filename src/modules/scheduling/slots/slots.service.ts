import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma, BookingStatus } from '@prisma/client';

type Slot = {
  slotUtc: string;
  displayTime: string;
};

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateSlots(mentorId: string, from: string, to: string, timezone: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { id: mentorId },
      select: { id: true, availability: true, onboardingStatus: true, isVerified: true },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor not found');
    }

    if (!mentor.isVerified || mentor.onboardingStatus !== 'COMPLETE') {
      throw new BadRequestException('Mentor is not available for booking');
    }

    const availability = (mentor.availability as Record<string, unknown> | null) ?? null;
    if (!availability || typeof availability !== 'object') {
      return { data: [] };
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date range');
    }

    const slots: Slot[] = [];
    const current = new Date(fromDate);
    current.setUTCHours(0, 0, 0, 0);

    while (current <= toDate) {
      const dayName = current.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }).toLowerCase();
      const daySlots = (availability as Record<string, unknown>)[dayName] as Array<{ start: string; end: string }> | undefined;

      if (daySlots && Array.isArray(daySlots)) {
        for (const slot of daySlots) {
          const [startHour, startMinute] = slot.start.split(':').map(Number);
          const [endHour, endMinute] = slot.end.split(':').map(Number);

          const slotStart = new Date(current);
          slotStart.setUTCHours(startHour, startMinute, 0, 0);

          const slotEnd = new Date(current);
          slotEnd.setUTCHours(endHour, endMinute, 0, 0);

          if (slotStart >= slotEnd) {
            continue;
          }

          if (slotStart < fromDate) {
            continue;
          }
          if (slotStart > toDate) {
            continue;
          }

          const displayTime = slotStart.toLocaleString('en-US', {
            timeZone: timezone,
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });

          slots.push({
            slotUtc: slotStart.toISOString(),
            displayTime,
          });
        }
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    const slotUtcs = slots.map((s) => s.slotUtc);
    if (slotUtcs.length > 0) {
      const existingBookings = await this.prisma.booking.findMany({
        where: {
          mentorId,
          status: { in: [BookingStatus.SCHEDULED] },
          scheduledAt: { in: slotUtcs.map((utc) => new Date(utc)) },
        },
        select: { scheduledAt: true },
      });

      const bookedSet = new Set(existingBookings.map((b) => b.scheduledAt.toISOString()));

      const blackouts = await this.prisma.blackoutDate.findMany({
        where: {
          mentorProfileId: mentorId,
          date: {
            gte: fromDate,
            lte: toDate,
          },
        },
        select: { date: true },
      });

      const blackoutSet = new Set(
        blackouts.map((b) => {
          const d = new Date(b.date);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        }),
      );

      const filtered = slots.filter((s) => {
        const dt = new Date(s.slotUtc);
        const dateKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
        if (bookedSet.has(s.slotUtc)) {
          return false;
        }
        if (blackoutSet.has(dateKey)) {
          return false;
        }
        return true;
      });

      return { data: filtered };
    }

    return { data: slots };
  }
}

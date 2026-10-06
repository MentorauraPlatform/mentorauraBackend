import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

type Slot = {
  slotUtc: string;
  displayTime: string;
};

type AvailabilityEntry = {
  day: string;
  startTime: string;
  endTime: string;
};

type AvailabilityFormatA = Record<string, Array<{ start: string; end: string }>>;
type AvailabilityFormatB = {
  timezone?: string;
  slots?: AvailabilityEntry[];
};

const DAY_ALIASES: Record<string, string> = {
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

    const rawAvailability = (mentor.availability as AvailabilityFormatB | AvailabilityFormatA | null) ?? null;
    if (!rawAvailability || typeof rawAvailability !== 'object') {
      return { data: [] };
    }

    const normalized = this.normalizeAvailability(rawAvailability);
    if (normalized.length === 0) {
      return { data: [] };
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date range');
    }

    const durationMs = 60 * 60 * 1000;
    const slots: Slot[] = [];
    const current = new Date(fromDate);
    current.setUTCHours(0, 0, 0, 0);

    while (current <= toDate) {
      const dayName = current.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }).toLowerCase();
      const normalizedDay = DAY_ALIASES[dayName] ?? dayName;
      const daySlots = normalized.find((s) => s.day === normalizedDay);

      if (daySlots) {
        const [startHour, startMinute] = daySlots.startTime.split(':').map(Number);
        const [endHour, endMinute] = daySlots.endTime.split(':').map(Number);

        const slotStart = new Date(current);
        slotStart.setUTCHours(startHour, startMinute, 0, 0);

        const slotEnd = new Date(current);
        slotEnd.setUTCHours(endHour, endMinute, 0, 0);

        if (slotStart < slotEnd) {
          if (slotStart < fromDate) {
            const diff = fromDate.getTime() - slotStart.getTime();
            const remainder = diff % durationMs;
            slotStart.setTime(slotStart.getTime() + diff + (remainder === 0 ? 0 : durationMs - remainder));
          }

          while (slotStart.getTime() + durationMs <= slotEnd.getTime() && slotStart <= toDate) {
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

            slotStart.setTime(slotStart.getTime() + durationMs);
          }
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

  private normalizeAvailability(raw: Record<string, unknown>): AvailabilityEntry[] {
    const entries: AvailabilityEntry[] = [];

    const formatA = raw as AvailabilityFormatA;
    const formatB = raw as AvailabilityFormatB;

    if ('slots' in raw && Array.isArray(formatB.slots)) {
      for (const entry of formatB.slots) {
        if (entry && typeof entry === 'object' && 'day' in entry && 'startTime' in entry && 'endTime' in entry) {
          const day = DAY_ALIASES[String(entry.day).toLowerCase()] ?? String(entry.day).toLowerCase();
          entries.push({
            day,
            startTime: String(entry.startTime),
            endTime: String(entry.endTime),
          });
        }
      }
      return entries;
    }

    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const dayKey of dayKeys) {
      const value = formatA[dayKey];
      if (Array.isArray(value)) {
        for (const window of value) {
          if (window && typeof window === 'object' && 'start' in window && 'end' in window) {
            entries.push({
              day: dayKey,
              startTime: String(window.start),
              endTime: String(window.end),
            });
          }
        }
      }
    }

    return entries;
  }
}

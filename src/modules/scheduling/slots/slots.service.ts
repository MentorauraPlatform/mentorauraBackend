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

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new BadRequestException(`Invalid IANA timezone: ${timezone}`);
  }
}

function getTimezoneOffsetMinutes(timezone: string, date: Date): number {
  assertValidTimezone(timezone);
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return (tzDate.getTime() - utcDate.getTime()) / (60 * 1000);
}

function toUtcMinutes(localHour: number, localMinute: number, offsetMinutes: number): number {
  return localHour * 60 + localMinute - offsetMinutes;
}

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

    assertValidTimezone(timezone);
    const mentorTimezone = (rawAvailability as AvailabilityFormatB).timezone || timezone;
    assertValidTimezone(mentorTimezone);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || toDate < fromDate) {
      throw new BadRequestException('Invalid date range');
    }

    const maxWindowMs = 62 * 24 * 60 * 60 * 1000;
    if (toDate.getTime() - fromDate.getTime() > maxWindowMs) {
      throw new BadRequestException('Date range cannot exceed 60 days');
    }

    const durationMs = 60 * 60 * 1000;
    const slots: Slot[] = [];
    const current = new Date(fromDate);
    current.setUTCHours(0, 0, 0, 0);

    const earliestBookable = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours minimum advance notice

    while (current <= toDate) {
      const dayName = current.toLocaleDateString('en-US', { weekday: 'long', timeZone: mentorTimezone }).toLowerCase();
      const normalizedDay = DAY_ALIASES[dayName] ?? dayName;
      const matchingDaySlots = normalized.filter((s) => s.day === normalizedDay);

      for (const daySlots of matchingDaySlots) {
        const [startHour, startMinute] = daySlots.startTime.split(':').map(Number);
        const [endHour, endMinute] = daySlots.endTime.split(':').map(Number);

        const dayStart = new Date(current);
        dayStart.setUTCHours(0, 0, 0, 0);

        const offsetMinutes = getTimezoneOffsetMinutes(mentorTimezone, dayStart);
        const slotStartMinutes = toUtcMinutes(startHour, startMinute, offsetMinutes);
        const slotEndMinutes = toUtcMinutes(endHour, endMinute, offsetMinutes);

        const slotStart = new Date(dayStart);
        slotStart.setUTCMinutes(slotStartMinutes);

        const slotEnd = new Date(dayStart);
        slotEnd.setUTCMinutes(slotEndMinutes);

        if (slotStart < slotEnd) {
          if (slotStart < fromDate) {
            const diff = fromDate.getTime() - slotStart.getTime();
            const remainder = diff % durationMs;
            slotStart.setTime(slotStart.getTime() + diff + (remainder === 0 ? 0 : durationMs - remainder));
          }

          while (slotStart.getTime() + durationMs <= slotEnd.getTime() && slotStart <= toDate) {
            // Must satisfy advance notice cutoff
            if (slotStart.getTime() >= earliestBookable.getTime()) {
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

            slotStart.setTime(slotStart.getTime() + durationMs);
          }
        }
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    if (slots.length > 0) {
      const minSlotTime = new Date(new Date(slots[0].slotUtc).getTime() - 3 * 60 * 60 * 1000);
      const maxSlotTime = new Date(new Date(slots[slots.length - 1].slotUtc).getTime() + 3 * 60 * 60 * 1000);

      const existingBookings = await this.prisma.booking.findMany({
        where: {
          mentorId,
          status: { in: [BookingStatus.SCHEDULED] },
          scheduledAt: { gte: minSlotTime, lte: maxSlotTime },
        },
        select: { scheduledAt: true, durationMinutes: true },
      });

      const blackouts = await this.prisma.blackoutDate.findMany({
        where: {
          mentorProfileId: mentorId,
          date: {
            gte: new Date(fromDate.getTime() - 24 * 60 * 60 * 1000),
            lte: new Date(toDate.getTime() + 24 * 60 * 60 * 1000),
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
        const slotStartMs = dt.getTime();
        const slotEndMs = slotStartMs + durationMs;

        const hasOverlap = existingBookings.some((b) => {
          const bStart = b.scheduledAt.getTime();
          const bEnd = bStart + (b.durationMinutes || 60) * 60 * 1000;
          return bStart < slotEndMs && bEnd > slotStartMs;
        });
        if (hasOverlap) {
          return false;
        }

        const mentorLocalDateParts = new Intl.DateTimeFormat('en-CA', {
          timeZone: mentorTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(dt);
        const utcDateKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
        if (blackoutSet.has(mentorLocalDateParts) || blackoutSet.has(utcDateKey)) {
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

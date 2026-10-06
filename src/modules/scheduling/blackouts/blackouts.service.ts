import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BlackoutDatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor profile not found');
    }

    const blackouts = await this.prisma.blackoutDate.findMany({
      where: { mentorProfileId: mentor.id },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, reason: true, createdAt: true },
    });

    return { data: blackouts };
  }

  async create(userId: string, date: string, reason?: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor profile not found');
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    try {
      const blackout = await this.prisma.blackoutDate.create({
        data: {
          mentorProfileId: mentor.id,
          date: dateObj,
          reason,
        },
        select: { id: true, date: true, reason: true, createdAt: true },
      });

      return { data: blackout };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Blackout date already exists for this date');
      }
      throw err;
    }
  }

  async remove(userId: string, id: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { userId },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor profile not found');
    }

    const blackout = await this.prisma.blackoutDate.findUnique({
      where: { id },
    });

    if (!blackout) {
      throw new NotFoundException('Blackout date not found');
    }

    if (blackout.mentorProfileId !== mentor.id) {
      throw new ForbiddenException('You are not authorized to delete this blackout date');
    }

    await this.prisma.blackoutDate.delete({
      where: { id },
    });

    return { data: { id } };
  }
}

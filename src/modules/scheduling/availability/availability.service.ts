import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailability(mentorId: string) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { id: mentorId },
      select: { id: true, availability: true },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor not found');
    }

    return { data: mentor.availability ?? {} };
  }

  async updateAvailability(mentorId: string, availability: Prisma.InputJsonValue) {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { id: mentorId },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor not found');
    }

    const updated = await this.prisma.mentorProfile.update({
      where: { id: mentorId },
      data: { availability: availability as unknown as Prisma.InputJsonValue },
      select: { id: true, availability: true },
    });

    return { data: updated.availability };
  }
}

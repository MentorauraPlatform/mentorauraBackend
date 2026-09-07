import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mentorId: true,
        title: true,
        description: true,
        priceAmount: true,
        currency: true,
        isActive: true,
        mentor: {
          select: {
            id: true,
            fullName: true,
            title: true,
            company: true,
          },
        },
      },
    });

    return { data: plans };
  }
}

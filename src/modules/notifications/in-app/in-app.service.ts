import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationType } from '@prisma/client';

export interface CreateInAppNotificationDto {
  userId: string;
  type?: NotificationType;
  title: string;
  message: string;
  data?: any;
}

@Injectable()
export class InAppService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInAppNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type || NotificationType.SYSTEM,
        title: dto.title,
        message: dto.message,
        data: dto.data || undefined,
        isRead: false,
      },
    });
  }

  async findAll(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const take = Math.min(Math.max(1, limit), 100);
    const skip = (page - 1) * take;

    const where: any = { userId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
        unreadCount,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}

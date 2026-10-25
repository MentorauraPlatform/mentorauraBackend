import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface FormattedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
  sender: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to verify if user is part of conversation
   */
  async validateMembership(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!conv) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conv.participant1Id !== userId && conv.participant2Id !== userId) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    const recipientId =
      conv.participant1Id === userId
        ? conv.participant2Id
        : conv.participant1Id;

    return { conv, recipientId };
  }

  /**
   * Format message with sender details
   */
  private formatMessage(msg: any): FormattedMessage {
    const name =
      msg.sender?.mentorProfile?.fullName ||
      msg.sender?.menteeProfile?.fullName ||
      msg.sender?.email?.split('@')[0] ||
      'User';
    const avatarUrl = msg.sender?.menteeProfile?.avatarUrl || null;

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      content: msg.content,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
      sender: {
        id: msg.sender?.id || msg.senderId,
        email: msg.sender?.email || '',
        name,
        avatarUrl,
      },
    };
  }

  /**
   * Cursor-paginated message history
   */
  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit: number = 30,
  ) {
    await this.validateMembership(userId, conversationId);

    const safeLimit = Math.min(Math.max(1, limit), 100);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      take: safeLimit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            mentorProfile: { select: { fullName: true } },
            menteeProfile: { select: { fullName: true, avatarUrl: true } },
          },
        },
      },
    });

    const hasMore = messages.length > safeLimit;
    if (hasMore) {
      messages.pop();
    }

    const nextCursor = hasMore ? messages[messages.length - 1]?.id : null;

    // Return in chronological order (oldest to newest) for UI rendering
    const chronological = messages.reverse().map((m) => this.formatMessage(m));

    return {
      data: chronological,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Create and persist a message
   */
  async createMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<{ message: FormattedMessage; recipientId: string }> {
    const trimmed = content?.trim();
    if (!trimmed) {
      throw new BadRequestException('Message content cannot be empty');
    }

    const { recipientId } = await this.validateMembership(
      userId,
      conversationId,
    );

    const [created] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: trimmed,
          isRead: false,
        },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              mentorProfile: { select: { fullName: true } },
              menteeProfile: { select: { fullName: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return {
      message: this.formatMessage(created),
      recipientId,
    };
  }

  /**
   * Mark incoming messages as read
   */
  async markAsRead(
    userId: string,
    conversationId: string,
    messageIds?: string[],
  ): Promise<{ count: number; recipientId: string }> {
    const { recipientId } = await this.validateMembership(
      userId,
      conversationId,
    );

    const whereClause: any = {
      conversationId,
      senderId: { not: userId },
      isRead: false,
    };

    if (messageIds && messageIds.length > 0) {
      whereClause.id = { in: messageIds };
    }

    const result = await this.prisma.message.updateMany({
      where: whereClause,
      data: { isRead: true },
    });

    return {
      count: result.count,
      recipientId,
    };
  }

  /**
   * Total unread messages count for a user across all conversations
   */
  async getUnreadCount(userId: string): Promise<number> {
    const count = await this.prisma.message.count({
      where: {
        conversation: {
          OR: [{ participant1Id: userId }, { participant2Id: userId }],
        },
        senderId: { not: userId },
        isRead: false,
      },
    });

    return count;
  }
}

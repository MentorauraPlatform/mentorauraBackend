import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface FormattedAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

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
  attachments: FormattedAttachment[];
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to verify if user is active
   */
  async isUserActive(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    return Boolean(user?.isActive);
  }

  /**
   * Helper to verify if user is part of conversation and active
   */
  async validateMembership(userId: string, conversationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException('User account is suspended or inactive');
    }

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participant1: {
          select: {
            id: true,
            email: true,
            mentorProfile: { select: { fullName: true } },
            menteeProfile: { select: { fullName: true } },
          },
        },
        participant2: {
          select: {
            id: true,
            email: true,
            mentorProfile: { select: { fullName: true } },
            menteeProfile: { select: { fullName: true } },
          },
        },
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

    const recipient =
      conv.participant1Id === userId ? conv.participant2 : conv.participant1;

    return { conv, recipientId: recipient.id, recipient };
  }

  /**
   * Format message with sender details and attachments
   */
  private formatMessage(msg: any): FormattedMessage {
    const name =
      msg.sender?.mentorProfile?.fullName ||
      msg.sender?.menteeProfile?.fullName ||
      msg.sender?.email?.split('@')[0] ||
      'User';
    const avatarUrl = msg.sender?.menteeProfile?.avatarUrl || null;

    const attachments: FormattedAttachment[] = (msg.attachments || []).map(
      (att: any) => ({
        id: att.id,
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        fileType: att.fileType,
        fileSize: att.fileSize,
      }),
    );

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
      attachments,
    };
  }

  /**
   * Cursor-paginated message history with attachments
   */
  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit = 30,
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
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileType: true,
            fileSize: true,
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
   * Create and persist a message with optional attachments
   */
  async createMessage(
    userId: string,
    conversationId: string,
    content?: string,
    attachmentIds?: string[],
  ): Promise<{
    message: FormattedMessage;
    recipientId: string;
    recipientUser: any;
  }> {
    const trimmed = content?.trim() || '';
    const hasAttachments = attachmentIds && attachmentIds.length > 0;

    if (!trimmed && !hasAttachments) {
      throw new BadRequestException('Message must contain text content or an attachment');
    }

    const { recipientId, recipient } = await this.validateMembership(
      userId,
      conversationId,
    );

    const messageContent = trimmed || (hasAttachments ? 'Sent an attachment' : '');

    const [created] = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: messageContent,
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
      });

      if (hasAttachments) {
        await tx.messageAttachment.updateMany({
          where: { id: { in: attachmentIds }, messageId: null },
          data: { messageId: msg.id },
        });
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      // Refetch with attachments populated
      const fullMsg = await tx.message.findUnique({
        where: { id: msg.id },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              mentorProfile: { select: { fullName: true } },
              menteeProfile: { select: { fullName: true, avatarUrl: true } },
            },
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              fileType: true,
              fileSize: true,
            },
          },
        },
      });

      return [fullMsg!];
    });

    return {
      message: this.formatMessage(created),
      recipientId,
      recipientUser: recipient,
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

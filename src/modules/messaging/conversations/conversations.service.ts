import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface ParticipantSummary {
  id: string;
  email: string;
  role: string;
  isMentor: boolean;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  title: string | null;
  company: string | null;
}

export interface ConversationSummary {
  id: string;
  mentorshipId: string | null;
  mentorship: {
    id: string;
    status: string;
    planTitle?: string;
  } | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  otherParticipant: ParticipantSummary;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    isRead: boolean;
    createdAt: Date;
  } | null;
  unreadCount: number;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to format the other participant's summary
   */
  private formatParticipant(user: any): ParticipantSummary {
    const isMentor = user.isMentor || user.role === 'MENTOR';
    const name =
      user.mentorProfile?.fullName ||
      user.menteeProfile?.fullName ||
      user.email.split('@')[0];
    const avatarUrl = user.menteeProfile?.avatarUrl || null;
    const headline =
      user.mentorProfile?.headline || user.menteeProfile?.headline || null;
    const title =
      user.mentorProfile?.title || user.menteeProfile?.currentRole || null;
    const company = user.mentorProfile?.company || null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isMentor,
      name,
      avatarUrl,
      headline,
      title,
      company,
    };
  }

  /**
   * Helper to canonicalize participant ordering for uniqueness
   */
  private canonicalizeParticipants(userAId: string, userBId: string) {
    if (userAId === userBId) {
      throw new BadRequestException('Cannot start conversation with yourself');
    }
    return userAId < userBId
      ? { participant1Id: userAId, participant2Id: userBId }
      : { participant1Id: userBId, participant2Id: userAId };
  }

  /**
   * Get all active conversations for a user
   */
  async getUserConversations(userId: string): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
      include: {
        participant1: {
          include: {
            mentorProfile: true,
            menteeProfile: true,
          },
        },
        participant2: {
          include: {
            mentorProfile: true,
            menteeProfile: true,
          },
        },
        mentorship: {
          include: {
            plan: { select: { title: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Compute unread counts per conversation in bulk
    const convIds = conversations.map((c) => c.id);
    const unreadMap = new Map<string, number>();

    if (convIds.length > 0) {
      const unreadCounts = await this.prisma.message.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: convIds },
          senderId: { not: userId },
          isRead: false,
        },
        _count: { conversationId: true },
      });

      for (const item of unreadCounts) {
        unreadMap.set(item.conversationId, item._count.conversationId);
      }
    }

    return conversations.map((conv) => {
      const isP1 = conv.participant1Id === userId;
      const otherUser = isP1 ? conv.participant2 : conv.participant1;
      const latestMessage = conv.messages[0] || null;

      return {
        id: conv.id,
        mentorshipId: conv.mentorshipId,
        mentorship: conv.mentorship
          ? {
              id: conv.mentorship.id,
              status: conv.mentorship.status,
              planTitle: conv.mentorship.plan?.title,
            }
          : null,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        otherParticipant: this.formatParticipant(otherUser),
        lastMessage: latestMessage
          ? {
              id: latestMessage.id,
              content: latestMessage.content,
              senderId: latestMessage.senderId,
              isRead: latestMessage.isRead,
              createdAt: latestMessage.createdAt,
            }
          : null,
        unreadCount: unreadMap.get(conv.id) ?? 0,
      };
    });
  }

  /**
   * Get single conversation details
   */
  async getConversationById(
    userId: string,
    conversationId: string,
  ): Promise<ConversationSummary> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participant1: {
          include: {
            mentorProfile: true,
            menteeProfile: true,
          },
        },
        participant2: {
          include: {
            mentorProfile: true,
            menteeProfile: true,
          },
        },
        mentorship: {
          include: {
            plan: { select: { title: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
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

    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId: conv.id,
        senderId: { not: userId },
        isRead: false,
      },
    });

    const isP1 = conv.participant1Id === userId;
    const otherUser = isP1 ? conv.participant2 : conv.participant1;
    const latestMessage = conv.messages[0] || null;

    return {
      id: conv.id,
      mentorshipId: conv.mentorshipId,
      mentorship: conv.mentorship
        ? {
            id: conv.mentorship.id,
            status: conv.mentorship.status,
            planTitle: conv.mentorship.plan?.title,
          }
        : null,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      otherParticipant: this.formatParticipant(otherUser),
      lastMessage: latestMessage
        ? {
            id: latestMessage.id,
            content: latestMessage.content,
            senderId: latestMessage.senderId,
            isRead: latestMessage.isRead,
            createdAt: latestMessage.createdAt,
          }
        : null,
      unreadCount,
    };
  }

  /**
   * Create or fetch conversation for a mentorship
   */
  async getOrCreateForMentorship(
    userId: string,
    mentorshipId: string,
  ): Promise<ConversationSummary> {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: mentorshipId },
      include: {
        mentor: { select: { userId: true } },
      },
    });

    if (!mentorship) {
      throw new NotFoundException(`Mentorship ${mentorshipId} not found`);
    }

    const menteeUserId = mentorship.menteeId;
    const mentorUserId = mentorship.mentor.userId;

    if (userId !== menteeUserId && userId !== mentorUserId) {
      throw new ForbiddenException(
        'You are not a member of this mentorship relationship',
      );
    }

    const { participant1Id, participant2Id } = this.canonicalizeParticipants(
      menteeUserId,
      mentorUserId,
    );

    // Try finding by mentorshipId first
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { mentorshipId },
          { participant1Id, participant2Id },
        ],
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          mentorshipId,
          participant1Id,
          participant2Id,
          lastMessageAt: new Date(),
        },
      });
    } else if (!conversation.mentorshipId) {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { mentorshipId },
      });
    }

    return this.getConversationById(userId, conversation.id);
  }

  /**
   * Direct 1-on-1 conversation creation or retrieval
   */
  async getOrCreateDirect(
    userId: string,
    targetUserId: string,
  ): Promise<ConversationSummary> {
    const { participant1Id, participant2Id } = this.canonicalizeParticipants(
      userId,
      targetUserId,
    );

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        participant1Id_participant2Id: {
          participant1Id,
          participant2Id,
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          participant1Id,
          participant2Id,
          lastMessageAt: new Date(),
        },
      });
    }

    return this.getConversationById(userId, conversation.id);
  }

  /**
   * Event listener: auto-create conversation when mentorship application is accepted
   */
  @OnEvent('mentorship.application.accepted')
  async handleApplicationAccepted(event: {
    applicationId: string;
    mentorshipId: string;
    menteeId: string;
    mentorId: string; // mentorProfile.id
  }) {
    try {
      this.logger.log(
        `Auto-creating conversation for accepted mentorship: ${event.mentorshipId}`,
      );

      const mentorProfile = await this.prisma.mentorProfile.findUnique({
        where: { id: event.mentorId },
        select: { userId: true },
      });

      if (!mentorProfile) {
        this.logger.warn(`Mentor profile ${event.mentorId} not found`);
        return;
      }

      const { participant1Id, participant2Id } = this.canonicalizeParticipants(
        event.menteeId,
        mentorProfile.userId,
      );

      await this.prisma.conversation.upsert({
        where: {
          participant1Id_participant2Id: {
            participant1Id,
            participant2Id,
          },
        },
        create: {
          mentorshipId: event.mentorshipId,
          participant1Id,
          participant2Id,
          lastMessageAt: new Date(),
        },
        update: {
          mentorshipId: event.mentorshipId,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to auto-create conversation on application accepted: ${err?.message}`,
        err?.stack,
      );
    }
  }

  /**
   * Event listener: auto-create conversation when mentorship is activated
   */
  @OnEvent('mentorship.activated')
  async handleMentorshipActivated(event: {
    mentorshipId: string;
    menteeId: string;
    mentorId: string; // mentorProfile.id
  }) {
    try {
      this.logger.log(
        `Ensuring conversation exists for activated mentorship: ${event.mentorshipId}`,
      );

      const mentorProfile = await this.prisma.mentorProfile.findUnique({
        where: { id: event.mentorId },
        select: { userId: true },
      });

      if (!mentorProfile) {
        return;
      }

      const { participant1Id, participant2Id } = this.canonicalizeParticipants(
        event.menteeId,
        mentorProfile.userId,
      );

      await this.prisma.conversation.upsert({
        where: {
          participant1Id_participant2Id: {
            participant1Id,
            participant2Id,
          },
        },
        create: {
          mentorshipId: event.mentorshipId,
          participant1Id,
          participant2Id,
          lastMessageAt: new Date(),
        },
        update: {
          mentorshipId: event.mentorshipId,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to handle mentorship activated conversation creation: ${err?.message}`,
      );
    }
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { MessagesService, FormattedMessage } from './messages.service';
import { InAppService } from '../../notifications/in-app/in-app.service';
import { EmailService } from '../../notifications/email/email.service';
import { NotificationType } from '@prisma/client';

interface SocketUser {
  userId: string;
  email: string;
  role?: string;
  isMentor?: boolean;
}

@Injectable()
@WebSocketGateway({
  namespace: '/messaging',
  cors: {
    origin: '*',
    credentials: true,
  },
})
@UsePipes(new ValidationPipe({ transform: true }))
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  // Track online users: userId -> Set of socket IDs
  private readonly onlineUsers = new Map<string, Set<string>>();

  // Debounce map for offline emails: key `${recipientId}:${conversationId}` -> timestamp
  private readonly lastOfflineEmailSent = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly messagesService: MessagesService,
    private readonly inAppService: InAppService,
    private readonly emailService: EmailService,
  ) {}

  afterInit() {
    this.logger.log(
      'Messaging WebSocket Gateway initialized at namespace /messaging',
    );
  }

  /**
   * Parse Cookie header safely
   */
  private parseCookies(cookieHeader?: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!cookieHeader) return result;
    for (const pair of cookieHeader.split(';')) {
      const [key, ...vals] = pair.trim().split('=');
      if (key) {
        result[key] = decodeURIComponent(vals.join('='));
      }
    }
    return result;
  }

  /**
   * Helper to check if a user is currently connected to WebSocket
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  /**
   * Handle incoming socket connection and JWT handshake
   */
  async handleConnection(client: Socket) {
    try {
      let token: string | undefined;

      if (client.handshake.auth?.token) {
        token = client.handshake.auth.token;
      } else if (client.handshake.headers?.authorization) {
        const parts = client.handshake.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
          token = parts[1];
        }
      } else if (client.handshake.headers?.cookie) {
        const cookies = this.parseCookies(client.handshake.headers.cookie);
        token = cookies.access_token || cookies.accessToken;
      }

      if (token && token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      if (!token) {
        this.logger.warn(
          `Client connection rejected: No token provided (${client.id})`,
        );
        client.emit('error', { message: 'Authentication required' });
        client.disconnect(true);
        return;
      }

      const secret =
        this.configService.get<string>('jwt.secret') ?? 'super-secret-key';

      const payload = await this.jwtService.verifyAsync(token, { secret });
      if (!payload?.sub) {
        throw new Error('Invalid token payload');
      }

      const isActive = await this.messagesService.isUserActive(payload.sub);
      if (!isActive) {
        throw new Error('User account is suspended or deactivated');
      }

      const user: SocketUser = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        isMentor: payload.isMentor,
      };

      client.data.user = user;

      // Track socket connection
      if (!this.onlineUsers.has(user.userId)) {
        this.onlineUsers.set(user.userId, new Set());
      }
      this.onlineUsers.get(user.userId)!.add(client.id);

      // Join user-specific room for private notifications
      await client.join(`user:${user.userId}`);
      this.logger.log(
        `Socket connected: ${client.id} (User: ${user.userId}, Email: ${user.email})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Socket connection auth failed: ${err?.message} (${client.id})`,
      );
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user: SocketUser | undefined = client.data.user;
    if (user?.userId) {
      const userSockets = this.onlineUsers.get(user.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.onlineUsers.delete(user.userId);
        }
      }
    }
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  /**
   * Join conversation room
   */
  @SubscribeMessage('join_conversation')
  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    try {
      await this.messagesService.validateMembership(
        user.userId,
        data.conversationId,
      );

      await client.join(`conversation:${data.conversationId}`);
      this.logger.log(
        `User ${user.userId} joined room conversation:${data.conversationId}`,
      );

      return { status: 'joined', conversationId: data.conversationId };
    } catch (err: any) {
      return { status: 'error', message: err.message || 'Forbidden' };
    }
  }

  /**
   * Leave conversation room
   */
  @SubscribeMessage('leave_conversation')
  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    await client.leave(`conversation:${data.conversationId}`);
    return { status: 'left', conversationId: data.conversationId };
  }

  /**
   * Send a real-time message with optional attachments via WebSocket
   */
  @SubscribeMessage('send_message')
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content?: string;
      attachmentIds?: string[];
    },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    try {
      const { message, recipientId, recipientUser } =
        await this.messagesService.createMessage(
          user.userId,
          data.conversationId,
          data.content,
          data.attachmentIds,
        );

      // Broadcast to all clients in the conversation room & recipient alerts
      await this.broadcastNewMessage(
        data.conversationId,
        message,
        recipientId,
        recipientUser,
      );

      return { status: 'sent', data: message };
    } catch (err: any) {
      return { status: 'error', message: err.message || 'Failed to send' };
    }
  }

  /**
   * Typing indicator start
   */
  @SubscribeMessage('typing_start')
  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user || !data?.conversationId) return;
    if (!client.rooms.has(`conversation:${data.conversationId}`)) return;

    client.to(`conversation:${data.conversationId}`).emit('typing_indicator', {
      conversationId: data.conversationId,
      userId: user.userId,
      isTyping: true,
    });
  }

  /**
   * Typing indicator stop
   */
  @SubscribeMessage('typing_stop')
  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user || !data?.conversationId) return;
    if (!client.rooms.has(`conversation:${data.conversationId}`)) return;

    client.to(`conversation:${data.conversationId}`).emit('typing_indicator', {
      conversationId: data.conversationId,
      userId: user.userId,
      isTyping: false,
    });
  }

  /**
   * Mark messages as read
   */
  @SubscribeMessage('mark_as_read')
  @SubscribeMessage('message:read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; messageIds?: string[] },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user) return;

    try {
      const { count } = await this.messagesService.markAsRead(
        user.userId,
        data.conversationId,
        data.messageIds,
      );

      this.broadcastMessagesRead(data.conversationId, user.userId);

      // Also update reader's unread count
      const newUnread = await this.messagesService.getUnreadCount(user.userId);
      this.server.to(`user:${user.userId}`).emit('unread_count_updated', {
        unreadCount: newUnread,
      });

      return { status: 'ok', count };
    } catch (err: any) {
      return { status: 'error', message: err.message };
    }
  }

  /**
   * Public helper to broadcast new message, trigger in-app notifications, and offline email alerts
   */
  async broadcastNewMessage(
    conversationId: string,
    message: FormattedMessage,
    recipientId: string,
    recipientUser?: any,
  ) {
    // 1. Emit to conversation room (matches both event name conventions)
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message_received', message);
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:new', message);

    // 2. Emit unread/preview update to recipient's personal user room
    this.server.to(`user:${recipientId}`).emit('conversation_updated', {
      conversationId,
      lastMessage: message,
    });

    // 3. Update recipient's total unread count
    void this.messagesService.getUnreadCount(recipientId).then((count) => {
      this.server.to(`user:${recipientId}`).emit('unread_count_updated', {
        unreadCount: count,
      });
    });

    // 4. Check if recipient is actively inside this conversation room
    const room = this.server?.sockets?.adapter?.rooms?.get(
      `conversation:${conversationId}`,
    );
    const recipientSockets = this.onlineUsers.get(recipientId);

    let isRecipientInConversation = false;
    if (room && recipientSockets) {
      for (const socketId of recipientSockets) {
        if (room.has(socketId)) {
          isRecipientInConversation = true;
          break;
        }
      }
    }

    // 5. If recipient is not active in this chat room, create an In-App notification asynchronously (non-blocking)
    if (!isRecipientInConversation) {
      void (async () => {
        try {
          const notif = await this.inAppService.create({
            userId: recipientId,
            type: NotificationType.MESSAGE,
            title: `New message from ${message.sender.name}`,
            message:
              message.content ||
              (message.attachments.length > 0
                ? 'Sent an attachment'
                : 'New message'),
            data: { conversationId, messageId: message.id },
          });

          // Real-time notification badge alert to recipient
          this.server.to(`user:${recipientId}`).emit('notification:new', notif);
        } catch (err: any) {
          this.logger.error(
            `Failed to create in-app notification: ${err?.message}`,
          );
        }
      })();
    }

    // 6. If recipient is completely OFFLINE, dispatch an email alert (debounced by 5 min)
    const isOnline = this.isUserOnline(recipientId);
    if (!isOnline && recipientUser?.email) {
      const debounceKey = `${recipientId}:${conversationId}`;
      const now = Date.now();
      const lastSent = this.lastOfflineEmailSent.get(debounceKey) || 0;
      const cooldownMs = 5 * 60 * 1000; // 5 minutes

      if (now - lastSent >= cooldownMs) {
        this.lastOfflineEmailSent.set(debounceKey, now);

        const recipientName =
          recipientUser.mentorProfile?.fullName ||
          recipientUser.menteeProfile?.fullName ||
          recipientUser.email.split('@')[0];

        void this.emailService.sendOfflineMessageNotification(
          recipientUser.email,
          recipientName,
          message.sender.name,
          message.content || 'Sent an attachment',
          conversationId,
        );
      }
    }
  }

  /**
   * Public helper to broadcast read status
   */
  broadcastMessagesRead(conversationId: string, readByUserId: string) {
    const payload = {
      conversationId,
      readBy: readByUserId,
      readAt: new Date().toISOString(),
    };
    this.server
      .to(`conversation:${conversationId}`)
      .emit('messages_read', payload);
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:read_ack', payload);
  }
}

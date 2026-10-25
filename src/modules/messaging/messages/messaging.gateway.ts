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
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { MessagesService, FormattedMessage } from './messages.service';

interface SocketUser {
  userId: string;
  email: string;
  role?: string;
  isMentor?: boolean;
}

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

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly messagesService: MessagesService,
  ) {}

  afterInit() {
    this.logger.log('Messaging WebSocket Gateway initialized at namespace /messaging');
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
   * Handle incoming socket connection and JWT handshake
   */
  async handleConnection(client: Socket) {
    try {
      let token: string | undefined;

      // Check auth object
      if (client.handshake.auth?.token) {
        token = client.handshake.auth.token;
      }
      // Check authorization header
      else if (client.handshake.headers?.authorization) {
        const parts = client.handshake.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
          token = parts[1];
        }
      }
      // Check cookies
      else if (client.handshake.headers?.cookie) {
        const cookies = this.parseCookies(client.handshake.headers.cookie);
        token = cookies.access_token || cookies.accessToken;
      }

      if (token && token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      if (!token) {
        this.logger.warn(`Client connection rejected: No token provided (${client.id})`);
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

      const user: SocketUser = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        isMentor: payload.isMentor,
      };

      client.data.user = user;

      // Join user-specific room for private updates
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
   * Send a real-time message via WebSocket
   */
  @SubscribeMessage('send_message')
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string },
  ) {
    const user: SocketUser | undefined = client.data.user;
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    try {
      const { message, recipientId } = await this.messagesService.createMessage(
        user.userId,
        data.conversationId,
        data.content,
      );

      // Broadcast to all clients in the conversation room
      this.broadcastNewMessage(data.conversationId, message, recipientId);

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
    if (!user) return;

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
    if (!user) return;

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
   * Public helper to broadcast new message to conversation room & recipient notification room
   */
  broadcastNewMessage(
    conversationId: string,
    message: FormattedMessage,
    recipientId: string,
  ) {
    // 1. Emit to conversation room (matches both event name conventions)
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message_received', message);
    this.server.to(`conversation:${conversationId}`).emit('message:new', message);

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

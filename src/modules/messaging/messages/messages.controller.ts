import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagingGateway } from './messaging.gateway';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesQueryDto } from './dto/get-messages.dto';
import { MarkReadDto } from './dto/mark-read.dto';

@Controller({ path: '', version: '1' })
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get('messages/unread-count')
  async getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    const unreadCount = await this.messagesService.getUnreadCount(user.userId);
    return { data: { unreadCount } };
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    const result = await this.messagesService.getMessages(
      user.userId,
      id,
      query.cursor,
      query.limit,
    );
    return result;
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    const { message, recipientId, recipientUser } = await this.messagesService.createMessage(
      user.userId,
      id,
      dto.content,
      dto.attachmentIds,
    );

    // Broadcast in real-time over WebSocket gateway and trigger alerts
    await this.messagingGateway.broadcastNewMessage(id, message, recipientId, recipientUser);

    return { data: message };
  }

  @Patch('conversations/:id/read')
  async markRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkReadDto,
  ) {
    const { count } = await this.messagesService.markAsRead(
      user.userId,
      id,
      dto.messageIds,
    );

    if (count > 0) {
      this.messagingGateway.broadcastMessagesRead(id, user.userId);
    }

    return { data: { count } };
  }
}

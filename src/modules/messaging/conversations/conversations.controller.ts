import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@Controller('api/v1/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async getMyConversations(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.conversationsService.getUserConversations(
      user.userId,
    );
    return { data };
  }

  @Get(':id')
  async getConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.conversationsService.getConversationById(
      user.userId,
      id,
    );
    return { data };
  }

  @Post('mentorship/:mentorshipId')
  async getOrCreateForMentorship(
    @CurrentUser() user: CurrentUserPayload,
    @Param('mentorshipId', ParseUUIDPipe) mentorshipId: string,
  ) {
    const data = await this.conversationsService.getOrCreateForMentorship(
      user.userId,
      mentorshipId,
    );
    return { data };
  }

  @Post('direct/:targetUserId')
  async getOrCreateDirect(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    const data = await this.conversationsService.getOrCreateDirect(
      user.userId,
      targetUserId,
    );
    return { data };
  }
}

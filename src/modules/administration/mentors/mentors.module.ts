import { Module } from '@nestjs/common';
import { AdminMentorsController } from './mentors.controller';
import { AdminMentorsService } from './mentors.service';
import { MentorEventsListener } from './mentor-events.listener';
import { MailService } from '../../../common/services/mail.service';

@Module({
  controllers: [AdminMentorsController],
  providers: [AdminMentorsService, MentorEventsListener, MailService],
  exports: [AdminMentorsService],
})
export class AdminMentorsModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagingGateway } from './messaging.gateway';
import { InAppModule } from '../../notifications/in-app/in-app.module';
import { EmailModule } from '../../notifications/email/email.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    InAppModule,
    EmailModule,
    AttachmentsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagingGateway],
  exports: [MessagesService, MessagingGateway],
})
export class MessagesModule {}

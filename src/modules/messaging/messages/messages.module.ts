import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagingGateway } from './messaging.gateway';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [MessagesController],
  providers: [MessagesService, MessagingGateway],
  exports: [MessagesService, MessagingGateway],
})
export class MessagesModule {}

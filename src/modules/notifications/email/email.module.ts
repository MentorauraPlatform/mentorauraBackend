import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { BookingNotificationsListener } from './booking-notifications.listener';
import { InAppModule } from '../in-app/in-app.module';

@Module({
  imports: [ConfigModule, InAppModule],
  controllers: [],
  providers: [EmailService, BookingNotificationsListener],
  exports: [EmailService, BookingNotificationsListener],
})
export class EmailModule {}

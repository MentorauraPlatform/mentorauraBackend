import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}

import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Module({
  controllers: [],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}

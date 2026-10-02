import { Module } from '@nestjs/common';
import { BlackoutsController } from './blackouts.controller';
import { BlackoutDatesService } from './blackouts.service';

@Module({
  controllers: [BlackoutsController],
  providers: [BlackoutDatesService],
  exports: [BlackoutDatesService],
})
export class BlackoutsModule {}

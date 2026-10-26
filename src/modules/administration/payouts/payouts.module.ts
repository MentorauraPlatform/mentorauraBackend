import { Module } from '@nestjs/common';
import { AdminPayoutsController } from './payouts.controller';
import { AdminPayoutsService } from './payouts.service';

@Module({
  controllers: [AdminPayoutsController],
  providers: [AdminPayoutsService],
  exports: [AdminPayoutsService],
})
export class AdminPayoutsModule {}

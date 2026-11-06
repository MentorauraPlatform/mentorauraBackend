import { Module } from '@nestjs/common';
import { BalanceController } from './balance.controller';
import { AdminPayoutsModule } from '../../administration/payouts/payouts.module';

@Module({
  imports: [AdminPayoutsModule],
  controllers: [BalanceController],
  providers: [],
  exports: [],
})
export class BalanceModule {}

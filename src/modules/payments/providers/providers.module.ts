import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ZopayAdapter } from './adapters/zopay.adapter';
import { MtnMomoAdapter } from './adapters/mtn-momo.adapter';
import { OrangeMoneyAdapter } from './adapters/orange-money.adapter';

@Module({
  imports: [ConfigModule],
  providers: [ZopayAdapter, MtnMomoAdapter, OrangeMoneyAdapter],
  exports: [ZopayAdapter, MtnMomoAdapter, OrangeMoneyAdapter],
})
export class ProvidersModule {}

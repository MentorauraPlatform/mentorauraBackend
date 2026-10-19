import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { LifecycleModule } from '../../mentorship/lifecycle/lifecycle.module';
import { ProvidersModule } from '../providers/providers.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [PrismaModule, ProvidersModule, LifecycleModule, ConfigModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}

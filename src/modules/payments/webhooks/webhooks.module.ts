import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { LifecycleModule } from '../../mentorship/lifecycle/lifecycle.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [PrismaModule, LifecycleModule, ProvidersModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

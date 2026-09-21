import { Module } from '@nestjs/common';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';

@Module({
  controllers: [LifecycleController],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}

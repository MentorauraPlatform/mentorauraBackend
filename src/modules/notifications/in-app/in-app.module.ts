import { Module } from '@nestjs/common';
import { InAppController } from './in-app.controller';
import { InAppService } from './in-app.service';

@Module({
  controllers: [InAppController],
  providers: [InAppService],
  exports: [InAppService],
})
export class InAppModule {}

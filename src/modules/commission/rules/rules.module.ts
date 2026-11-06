import { Module } from '@nestjs/common';
import { RulesService } from './rules.service';

@Module({
  controllers: [],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}

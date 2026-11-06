import { Module } from '@nestjs/common';
import { CalculationService } from './calculation.service';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [RulesModule],
  controllers: [],
  providers: [CalculationService],
  exports: [CalculationService],
})
export class CalculationModule {}

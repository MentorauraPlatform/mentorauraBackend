import { Module } from '@nestjs/common';
import { RecordsService } from './records.service';
import { CalculationModule } from '../calculation/calculation.module';

@Module({
  imports: [CalculationModule],
  controllers: [],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}

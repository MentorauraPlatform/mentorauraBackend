import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateCompletedGoalsDto {
  @ApiProperty({ example: ['Master System Design & Microservices'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  completedGoals: string[];
}

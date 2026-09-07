import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';

export class UpdateGoalsDto {
  @ApiProperty({ example: ['Career Development', 'Technical Skill Development'], type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Select at least one goal' })
  @IsString({ each: true })
  @ArrayMaxSize(10)
  goals: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ToggleGoalDto {
  @ApiProperty({ example: 'Master System Design & Microservices' })
  @IsString()
  @IsNotEmpty()
  goal: string;
}

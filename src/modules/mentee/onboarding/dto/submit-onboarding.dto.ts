import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SubmitOnboardingDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  confirmed: boolean;
}

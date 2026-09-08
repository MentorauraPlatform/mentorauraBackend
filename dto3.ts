import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class SubmitOnboardingDto {
  @ApiProperty({
    example: true,
    description: 'Confirmation that information is correct',
  })
  @IsBoolean()
  @IsNotEmpty()
  confirmed: boolean;
}

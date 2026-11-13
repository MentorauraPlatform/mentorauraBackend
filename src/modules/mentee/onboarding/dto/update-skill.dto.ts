import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SkillLevel } from '@prisma/client';

export class UpdateSkillDto {
  @ApiProperty({ enum: SkillLevel })
  @IsEnum(SkillLevel)
  level: SkillLevel;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { SkillLevel } from '@prisma/client';

export class AddSkillDto {
  @ApiProperty({ example: 'TypeScript' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ enum: SkillLevel, default: SkillLevel.BEGINNER })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;
}

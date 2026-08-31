import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { SkillLevel } from '@prisma/client';

export class UpdateSkillDto {
  @ApiProperty({
    enum: SkillLevel,
    example: 'EXPERT',
    description: 'New proficiency level',
  })
  @IsEnum(SkillLevel, { message: 'Invalid skill level' })
  level: SkillLevel;
}

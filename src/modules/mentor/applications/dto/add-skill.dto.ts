import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { SkillLevel } from '@prisma/client';

export class AddSkillDto {
  @ApiProperty({ example: 'skill-123', description: 'Skill ID' })
  @IsString()
  @IsNotEmpty()
  skillId: string;

  @ApiProperty({
    enum: SkillLevel,
    example: 'ADVANCED',
    description: 'Proficiency level',
  })
  @IsEnum(SkillLevel, { message: 'Invalid skill level' })
  level: SkillLevel;
}

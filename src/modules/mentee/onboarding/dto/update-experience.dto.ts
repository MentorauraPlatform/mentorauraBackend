import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, Min, MaxLength } from 'class-validator';

export class UpdateExperienceDto {
  @ApiPropertyOptional({ enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] })
  @IsOptional()
  @IsIn(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'])
  experienceLevel?: string;

  @ApiPropertyOptional({ example: 'Student' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  currentRole?: string;

  @ApiPropertyOptional({ example: 'BSc Computer Science' })
  @IsOptional()
  @IsString()
  educationBackground?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;
}

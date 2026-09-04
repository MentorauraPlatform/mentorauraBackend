import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsArray, ArrayMaxSize } from 'class-validator';

export class UpdateMentorProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe', description: 'Full name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'Senior Software Engineer',
    description: 'Professional title',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ example: 'Acme Corp', description: 'Company name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  company?: string;

  @ApiPropertyOptional({
    example: 'I help developers build scalable systems.',
    description: 'Professional bio',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({
    example: '10 years of experience in distributed systems.',
    description: 'Professional experience',
  })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  experience?: string;

  @ApiPropertyOptional({
    example: ['Software Engineering', 'System Design', 'Career Growth'],
    description: 'Areas of expertise',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @MaxLength(100, { each: true })
  @ArrayMaxSize(20)
  areasOfExpertise?: string[];
}

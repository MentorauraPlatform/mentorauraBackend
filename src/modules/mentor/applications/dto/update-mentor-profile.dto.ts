import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateMentorProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe', description: 'Full name' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: 'Senior Software Engineer', description: 'Professional title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'Acme Corp', description: 'Company name' })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({ example: 'I help developers build scalable systems.', description: 'Professional bio' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ example: '10 years of experience in distributed systems.', description: 'Professional experience' })
  @IsString()
  @IsOptional()
  experience?: string;

  @ApiPropertyOptional({
    example: ['Software Engineering', 'System Design', 'Career Growth'],
    description: 'Areas of expertise',
    type: [String],
  })
  @IsOptional()
  areasOfExpertise?: string[];
}

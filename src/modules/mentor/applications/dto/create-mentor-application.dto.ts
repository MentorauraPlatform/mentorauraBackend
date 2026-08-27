import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMentorApplicationDto {
  @ApiProperty({
    example: 'Jane Doe',
    description: 'Full name as it should appear on the mentor profile',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName: string;

  @ApiProperty({
    example: 'Senior Software Engineer',
    description: 'Professional title',
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @ApiPropertyOptional({ example: 'Acme Corp', description: 'Company name' })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({
    example: 'I help developers build scalable systems.',
    description: 'Professional bio',
  })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({
    example: '10 years of experience in distributed systems.',
    description: 'Professional experience',
  })
  @IsString()
  @IsOptional()
  experience?: string;

  @ApiPropertyOptional({
    example: ['Software Engineering', 'System Design', 'Career Growth'],
    description: 'Areas of expertise',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  areasOfExpertise?: string[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  Min,
  Max,
} from 'class-validator';

export class CreateMentorApplicationDto {
  @ApiProperty({
    example: 'Jane Doe',
    description: 'Full name as it should appear on the mentor profile',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(100)
  fullName: string;

  @ApiProperty({
    example: 'Senior Software Engineer',
    description: 'Professional title',
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({
    example: 'Distributed Systems & Cloud Architecture',
    description: 'Professional headline',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  headline?: string;

  @ApiPropertyOptional({ example: 'Acme Corp', description: 'Company name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  company?: string;

  @ApiPropertyOptional({
    example: 'I help developers build scalable systems.',
    description: 'Professional bio (up to 5000 characters)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
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
    example: 10,
    description: 'Years of professional experience',
  })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(60)
  yearsOfExperience?: number;

  @ApiPropertyOptional({
    example: 'https://linkedin.com/in/janedoe',
    description: 'LinkedIn profile URL',
  })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  linkedinUrl?: string;

  @ApiPropertyOptional({
    example: 'https://github.com/janedoe',
    description: 'GitHub profile URL',
  })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  githubUrl?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/cv.pdf',
    description: 'CV document URL',
  })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  cvUrl?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/id.pdf',
    description: 'ID document URL',
  })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  idDocumentUrl?: string;

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

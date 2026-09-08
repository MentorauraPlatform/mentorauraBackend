import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
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

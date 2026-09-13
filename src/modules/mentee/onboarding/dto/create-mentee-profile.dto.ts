import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateMenteeProfileDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(255)
  fullName: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Aspiring Software Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  headline?: string;
}

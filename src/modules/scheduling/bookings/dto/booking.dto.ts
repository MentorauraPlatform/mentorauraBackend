import { IsUUID, IsISO8601, IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ description: 'Mentorship UUID' })
  @IsUUID()
  mentorshipId!: string;

  @ApiProperty({ description: 'Scheduled date-time in ISO 8601 format' })
  @IsISO8601()
  scheduledAt!: string;

  @ApiPropertyOptional({ description: 'Session duration in minutes', default: 60 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(180)
  durationMinutes?: number;
}

export class CancelBookingDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class NoShowBookingDto {
  @ApiProperty({ description: 'Role reporting the no-show', enum: ['MENTOR', 'MENTEE'] })
  @IsIn(['MENTOR', 'MENTEE'])
  reportedBy!: 'MENTOR' | 'MENTEE';

  @ApiPropertyOptional({ description: 'Optional explanation of no-show event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  Matches,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';

export class TimeSlotDto {
  @ApiProperty({
    enum: [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ],
  })
  @IsEnum([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ])
  day: string;

  @ApiProperty({ example: '09:00', description: 'HH:MM start time' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Invalid time format HH:MM',
  })
  startTime: string;

  @ApiProperty({ example: '17:00', description: 'HH:MM end time' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Invalid time format HH:MM',
  })
  endTime: string;
}

export class AvailabilityDto {
  @ApiProperty({ example: 'Africa/Douala', description: 'IANA timezone' })
  @IsString()
  @Matches(/^[A-Za-z]+\/[A-Za-z_]+$/, { message: 'Invalid timezone' })
  timezone: string;

  @ApiProperty({
    description: 'Availability time slots',
  })
  @IsArray()
  @ValidateNested({ each: true })
  slots: TimeSlotDto[];
}

export class UpdateAvailabilityDto {
  @ApiProperty({
    example: { timezone: 'Africa/Douala', slots: [] },
    description: 'Availability data',
  })
  @IsNotEmpty()
  @ValidateNested()
  availability: AvailabilityDto;
}

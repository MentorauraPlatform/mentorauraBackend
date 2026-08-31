import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject } from 'class-validator';

export class UpdateAvailabilityDto {
  @ApiProperty({
    example: { timezone: 'Africa/Douala', slots: [] },
    description: 'Availability data',
  })
  @IsObject()
  @IsNotEmpty()
  availability: Record<string, unknown>;
}

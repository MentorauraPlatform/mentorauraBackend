import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';

export class UpdateInterestsDto {
  @ApiProperty({ example: ['Technology', 'Business', 'Design'], type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Select at least one interest' })
  @IsString({ each: true })
  @ArrayMaxSize(20)
  interests: string[];
}

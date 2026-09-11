import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CurrencyEnum {
  XAF = 'XAF',
  USD = 'USD',
  EUR = 'EUR',
}

export class CreatePlanDto {
  @ApiProperty({ example: '1-on-1 Monthly Mentorship', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({
    example: 'Weekly 45min video call + async chat support',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 1500000,
    description: 'Price in minor currency units (e.g. 15000 XAF)',
  })
  @IsInt()
  @Min(0)
  priceAmount: number;

  @ApiProperty({ enum: CurrencyEnum, default: CurrencyEnum.XAF })
  @IsEnum(CurrencyEnum)
  currency: CurrencyEnum;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  sessionsPerMonth?: number;
}

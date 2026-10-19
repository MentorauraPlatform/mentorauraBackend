import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentMethodProvider {
  MTN_MOMO = 'MTN_MOMO',
  ORANGE_MONEY = 'ORANGE_MONEY',
  CARD = 'CARD',
  ZOPAY = 'ZOPAY',
  STRIPE = 'STRIPE',
  CINETPAY = 'CINETPAY',
}

export class InitiatePaymentDto {
  @ApiProperty({
    description: 'UUID of the mentorship in INTRO status to pay for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  mentorshipId!: string;

  @ApiProperty({
    enum: PaymentMethodProvider,
    description: 'Payment rail/provider',
    example: PaymentMethodProvider.MTN_MOMO,
  })
  @IsEnum(PaymentMethodProvider)
  @IsNotEmpty()
  provider!: PaymentMethodProvider;

  @ApiPropertyOptional({
    description: 'Payer mobile money phone number (e.g. +2376XXXXXXXX or 6XXXXXXXX)',
    example: '+237671234567',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Return URL after card or hosted checkout redirection',
    example: 'https://mentoraura.com/mentee/dashboard/mentorships/123/checkout?status=success',
  })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

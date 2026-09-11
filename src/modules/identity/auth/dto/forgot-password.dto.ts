import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class RequestPasswordResetOtpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Account email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email: string;
}

export class VerifyPasswordResetOtpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Account email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP verification code',
  })
  @IsString()
  @IsNotEmpty({ message: 'OTP verification code is required' })
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit numeric code' })
  otp: string;
}

export class ResetPasswordWithOtpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Account email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP verification code',
  })
  @IsString()
  @IsNotEmpty({ message: 'OTP verification code is required' })
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit numeric code' })
  otp: string;

  @ApiProperty({
    example: 'NewSecretPass123!',
    description: 'New password meeting security requirements',
  })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(100, { message: 'Password must not exceed 100 characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character',
  })
  newPassword: string;
}

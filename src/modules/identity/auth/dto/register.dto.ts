import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export enum UserRole {
  MENTEE = 'MENTEE',
  MENTOR = 'MENTOR',
}

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Minimum 8 characters with upper, lower, and number/symbol',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character',
  })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @ApiProperty({ example: 'John Doe', description: 'User full display name' })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the user is a mentor',
  })
  @IsOptional()
  isMentor?: boolean = false;

  @ApiPropertyOptional({
    enum: UserRole,
    default: UserRole.MENTEE,
    description: 'Role of user (MENTEE or MENTOR)',
  })
  @IsEnum(UserRole, { message: 'Role must be either MENTEE or MENTOR' })
  @IsOptional()
  role?: UserRole = UserRole.MENTEE;
}

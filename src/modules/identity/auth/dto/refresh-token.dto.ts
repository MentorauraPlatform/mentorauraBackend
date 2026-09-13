import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Valid refresh token string' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

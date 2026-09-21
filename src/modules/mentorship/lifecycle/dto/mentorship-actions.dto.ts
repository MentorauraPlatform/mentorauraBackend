import { IsString, IsOptional } from 'class-validator';

export class ActivateMentorshipDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CancelMentorshipDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class PauseMentorshipDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CompleteMentorshipDto {
  @IsString()
  @IsOptional()
  feedback?: string;
}

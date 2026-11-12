import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateMenteeGoalsDto {
  @IsArray()
  @IsString({ each: true })
  goals: string[];
}

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

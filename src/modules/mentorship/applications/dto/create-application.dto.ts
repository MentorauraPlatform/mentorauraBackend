import { IsUUID, IsString, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateMentorshipApplicationDto {
  @IsUUID()
  @IsNotEmpty()
  planId!: string;

  @IsString()
  @MaxLength(500)
  message?: string;
}

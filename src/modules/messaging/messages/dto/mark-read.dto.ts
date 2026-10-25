import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class MarkReadDto {
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  messageIds?: string[];
}

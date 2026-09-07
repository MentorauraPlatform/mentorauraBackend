import { PartialType } from '@nestjs/swagger';
import { CreateMenteeProfileDto } from './create-mentee-profile.dto';

export class UpdateMenteeProfileDto extends PartialType(CreateMenteeProfileDto) {}

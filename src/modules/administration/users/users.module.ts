import { Module } from '@nestjs/common';
import { AdminUsersController } from './users.controller';
import { AdminUsersService } from './users.service';
import { MailService } from '../../../common/services/mail.service';

@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService, MailService],
  exports: [AdminUsersService],
})
export class UsersModule {}

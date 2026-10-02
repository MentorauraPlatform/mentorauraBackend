import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MailService } from '../../../common/services/mail.service';

@Injectable()
export class MentorEventsListener {
  private readonly logger = new Logger(MentorEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('mentor.application.approved')
  async handleMentorApproved(event: {
    mentorProfileId: string;
    userId: string;
    adminId: string;
  }) {
    this.logger.log(`Handling mentor.application.approved for profile ${event.mentorProfileId}`);
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        include: { mentorProfile: true },
      });
      if (user && user.email) {
        const fullName = user.mentorProfile?.fullName || 'Mentor';
        await this.mailService.sendMentorApplicationApprovedEmail(user.email, fullName);
      }
    } catch (err) {
      this.logger.error('Failed to send approval notification email', err);
    }
  }

  @OnEvent('mentor.application.rejected')
  async handleMentorRejected(event: {
    mentorProfileId: string;
    userId: string;
    reason: string;
    adminId: string;
  }) {
    this.logger.log(`Handling mentor.application.rejected for profile ${event.mentorProfileId}`);
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        include: { mentorProfile: true },
      });
      if (user && user.email) {
        const fullName = user.mentorProfile?.fullName || 'Applicant';
        await this.mailService.sendMentorApplicationRejectedEmail(user.email, fullName, event.reason);
      }
    } catch (err) {
      this.logger.error('Failed to send rejection notification email', err);
    }
  }
}

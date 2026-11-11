import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.configService.get<number>('SMTP_PORT', 587));
    const user =
      this.configService.get<string>('EMAIL_HOST_USER') ||
      this.configService.get<string>('SMTP_USER', 'nebcode26@gmail.com');
    const pass =
      this.configService.get<string>('EMAIL_HOST_PASSWORD') ||
      this.configService.get<string>('SMTP_PASS', 'ynvo gdsy tsbq gwir');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
  }

  private getBaseEmail(content: string): string {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://mentoraura.com',
    );
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FFFCF9; margin: 0; padding: 40px 20px; }
            .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
            .logo { font-size: 24px; font-weight: 900; color: #172033; text-decoration: none; margin-bottom: 24px; display: inline-block; }
            .logo span { color: #F97316; }
            h1 { color: #172033; font-size: 22px; font-weight: 800; margin-bottom: 16px; }
            p { color: #64748B; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .btn { display: inline-block; background-color: #F97316; color: #ffffff !important; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 12px; text-decoration: none; }
            .box { background-color: #FFF7ED; border-left: 4px solid #F97316; padding: 16px; border-radius: 8px; margin: 20px 0; color: #9A3412; font-size: 14px; }
            .footer { margin-top: 32px; pt: 24px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #94A3B8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="${frontendUrl}" class="logo">Mentor<span>Aura</span></a>
            ${content}
            <div class="footer">
              © ${new Date().getFullYear()} MentorAura Inc. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;
  }

  async sendOfflineMessageNotification(
    to: string,
    recipientName: string,
    senderName: string,
    messagePreview: string,
    conversationId: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://mentoraura.com',
    );
    const chatUrl = `${frontendUrl}/dashboard/messages?conversationId=${conversationId}`;
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      'Nebcode <nebcode26@gmail.com>',
    );

    const safePreview =
      messagePreview.length > 180
        ? `${messagePreview.slice(0, 180)}...`
        : messagePreview;

    const content = `
      <h1>New message from ${senderName}</h1>
      <p>Hi ${recipientName},</p>
      <p>You received a new message on MentorAura while you were offline:</p>
      <div class="box">
        <strong>${senderName}:</strong> "${safePreview}"
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${chatUrl}" class="btn">Reply on MentorAura</a>
      </div>
      <p style="font-size: 13px;">Log in to your dashboard to continue the conversation.</p>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `💬 New message from ${senderName} on MentorAura`,
        html: this.getBaseEmail(content),
      });
      this.logger.log(`Offline message alert sent to ${to}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send offline message email to ${to}: ${err?.message}`);
      return false;
    }
  }

  async sendBookingConfirmation(
    to: string,
    recipientName: string,
    partnerName: string,
    scheduledAt: Date,
    meetingLink: string,
  ): Promise<boolean> {
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      'Nebcode <nebcode26@gmail.com>',
    );

    const formattedDate = scheduledAt.toUTCString();

    const content = `
      <h1 style="color: #059669;">Session Booking Confirmed 📅</h1>
      <p>Hi ${recipientName},</p>
      <p>Your mentorship session with <strong>${partnerName}</strong> is confirmed!</p>
      <div class="box" style="border-left-color: #059669; background-color: #ECFDF5; color: #065F46;">
        <p style="margin: 0 0 8px 0;"><strong>Scheduled Time (UTC):</strong> ${formattedDate}</p>
        <p style="margin: 0;"><strong>Video Meeting Room:</strong> <a href="${meetingLink}" style="color: #059669; font-weight: bold;">Join Video Call</a></p>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${meetingLink}" class="btn" style="background-color: #059669;">Join Meeting Room</a>
      </div>
      <p style="font-size: 13px;">Please make sure your camera and microphone are tested before the call.</p>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `📅 Booking Confirmed with ${partnerName} - MentorAura`,
        html: this.getBaseEmail(content),
      });
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send booking confirmation email to ${to}: ${err?.message}`);
      return false;
    }
  }

  async sendBookingCancellation(
    to: string,
    recipientName: string,
    partnerName: string,
    scheduledAt: Date,
    reason: string,
  ): Promise<boolean> {
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      'Nebcode <nebcode26@gmail.com>',
    );

    const content = `
      <h1 style="color: #E11D48;">Session Cancelled</h1>
      <p>Hi ${recipientName},</p>
      <p>Your mentorship session with <strong>${partnerName}</strong> scheduled for ${scheduledAt.toUTCString()} has been cancelled.</p>
      <div class="box" style="border-left-color: #E11D48; background-color: #FFF1F2; color: #9F1239;">
        <strong>Reason:</strong> ${reason}
      </div>
      <p>If you would like to reschedule, please visit the mentor profile to book a new available time slot.</p>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `⚠️ Session with ${partnerName} Cancelled - MentorAura`,
        html: this.getBaseEmail(content),
      });
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send cancellation email to ${to}: ${err?.message}`);
      return false;
    }
  }
}

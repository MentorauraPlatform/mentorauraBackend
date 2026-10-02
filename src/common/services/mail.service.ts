import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.configService.get<number>('SMTP_PORT', 587));
    const user = this.configService.get<string>(
      'SMTP_USER',
      'edulinkcameroon@gmail.com',
    );
    const pass = this.configService.get<string>(
      'SMTP_PASS',
      'kdqj rerm qhji zitd',
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Send high-security HTML email verification link to user
   */
  async sendVerificationEmail(
    to: string,
    fullName: string,
    token: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      '"MentorAura" <edulinkcameroon@gmail.com>',
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FFFCF9; margin: 0; padding: 40px 20px; }
            .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
            .logo { font-size: 24px; font-weight: 900; color: #172033; text-decoration: none; margin-bottom: 24px; display: inline-block; }
            .logo span { color: #F97316; }
            h1 { color: #172033; font-size: 24px; font-weight: 800; margin-bottom: 16px; }
            p { color: #64748B; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .btn { display: inline-block; background-color: #F97316; color: #ffffff !important; font-weight: 700; font-size: 16px; padding: 14px 32px; border-radius: 14px; text-decoration: none; shadow: 0 4px 12px rgba(249,115,22,0.3); }
            .footer { margin-top: 32px; pt: 24px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #94A3B8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="${frontendUrl}" class="logo">Mentor<span>Aura</span></a>
            <h1>Verify your email address</h1>
            <p>Hi ${fullName},</p>
            <p>Welcome to MentorAura! Please confirm your email address by clicking the button below to complete your registration and activate your account.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verificationUrl}" class="btn" target="_blank">Verify Email Address</a>
            </div>
            <p>If the button doesn't work, copy and paste this link into your web browser:</p>
            <p style="word-break: break-all; color: #F97316; font-size: 13px;">${verificationUrl}</p>
            <p>This verification link will expire in 10 minutes. If you did not create a MentorAura account, please ignore this email.</p>
            <div class="footer">
              © ${new Date().getFullYear()} MentorAura Inc. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Verify your MentorAura account',
        html: htmlContent,
      });
      this.logger.log(`Verification email sent successfully to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error);
      return false;
    }
  }

  /**
   * Send 6-digit OTP code for secure password reset
   */
  async sendPasswordResetOtpEmail(
    to: string,
    fullName: string,
    otp: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      '"MentorAura" <edulinkcameroon@gmail.com>',
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FFFCF9; margin: 0; padding: 40px 20px; }
            .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
            .logo { font-size: 24px; font-weight: 900; color: #172033; text-decoration: none; margin-bottom: 24px; display: inline-block; }
            .logo span { color: #F97316; }
            h1 { color: #172033; font-size: 24px; font-weight: 800; margin-bottom: 16px; }
            p { color: #64748B; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .otp-box { background-color: #FFF7ED; border: 2 border-dashed #F97316; border-radius: 16px; padding: 20px; text-align: center; margin: 24px 0; }
            .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #EA580C; }
            .footer { margin-top: 32px; pt: 24px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #94A3B8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="${frontendUrl}" class="logo">Mentor<span>Aura</span></a>
            <h1>Reset your password</h1>
            <p>Hi ${fullName},</p>
            <p>You requested a password reset for your MentorAura account. Use the 6-digit verification code below to authorize the password reset:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p>This verification code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
            <p>If you did not request a password reset, please ignore this email or contact support if you suspect unauthorized activity.</p>
            <div class="footer">
              © ${new Date().getFullYear()} MentorAura Inc. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `${otp} is your MentorAura password reset code`,
        html: htmlContent,
      });
      this.logger.log(`Password reset OTP sent successfully to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send password reset OTP to ${to}`, error);
      return false;
    }
  }

  /**
   * Send administrative invitation email with setup token
   */
  async sendAdminInvitationEmail(
    to: string,
    role: string,
    token: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const inviteUrl = `${frontendUrl}/auth/admin/accept-invite?token=${token}`;
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      '"MentorAura" <edulinkcameroon@gmail.com>',
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0F172A; margin: 0; padding: 40px 20px; }
            .container { max-width: 560px; margin: 0 auto; background: #1E293B; border: 1px solid #334155; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); color: #F8FAFC; }
            .logo { font-size: 24px; font-weight: 900; color: #F8FAFC; text-decoration: none; margin-bottom: 24px; display: inline-block; }
            .logo span { color: #F97316; }
            h1 { color: #F8FAFC; font-size: 24px; font-weight: 800; margin-bottom: 16px; }
            p { color: #94A3B8; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .badge { display: inline-block; background-color: #38BDF8/20; color: #38BDF8; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 8px; margin-bottom: 16px; }
            .btn { display: inline-block; background-color: #F97316; color: #ffffff !important; font-weight: 700; font-size: 16px; padding: 14px 32px; border-radius: 14px; text-decoration: none; shadow: 0 4px 12px rgba(249,115,22,0.4); }
            .footer { margin-top: 32px; pt: 24px; border-top: 1px solid #334155; font-size: 12px; color: #64748B; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="${frontendUrl}" class="logo">Mentor<span>Aura</span></a>
            <div class="badge">ROLE: ${role}</div>
            <h1>Administrator Invitation</h1>
            <p>You have been invited to join the MentorAura administrative team as a <strong>${role}</strong>.</p>
            <p>Click the button below to accept your invitation, set your password, and activate your administrative access.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}" class="btn" target="_blank">Accept Invitation & Set Password</a>
            </div>
            <p style="font-size: 13px; color: #64748B;">This invitation token expires in 48 hours. If you did not expect this invitation, please contact your platform super administrator.</p>
            <div class="footer">
              © ${new Date().getFullYear()} MentorAura Inc. Administrative Access Portal.
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Admin Invitation: Join the MentorAura Team (${role})`,
        html: htmlContent,
      });
      this.logger.log(`Admin invitation email sent successfully to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send admin invitation email to ${to}`, error);
      return false;
    }
  }

  /**
   * Send notification when mentor application is approved
   */
  async sendMentorApplicationApprovedEmail(
    to: string,
    fullName: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const loginUrl = `${frontendUrl}/auth?mode=login`;
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      '"MentorAura" <edulinkcameroon@gmail.com>',
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FFFCF9; margin: 0; padding: 40px 20px; }
            .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
            .logo { font-size: 24px; font-weight: 900; color: #172033; text-decoration: none; margin-bottom: 24px; display: inline-block; }
            .logo span { color: #F97316; }
            h1 { color: #059669; font-size: 24px; font-weight: 800; margin-bottom: 16px; }
            p { color: #64748B; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .btn { display: inline-block; background-color: #059669; color: #ffffff !important; font-weight: 700; font-size: 16px; padding: 14px 32px; border-radius: 14px; text-decoration: none; }
            .footer { margin-top: 32px; pt: 24px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #94A3B8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="${frontendUrl}" class="logo">Mentor<span>Aura</span></a>
            <h1>Congratulations! Your Mentor Profile is Approved 🎉</h1>
            <p>Hi ${fullName},</p>
            <p>Great news! The MentorAura vetting team has verified your credentials and approved your mentor application.</p>
            <p>Your profile is now published live on our public directory, and mentees can discover your expertise and book mentorship sessions with you.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${loginUrl}" class="btn" target="_blank">Access Mentor Dashboard</a>
            </div>
            <p>Log in to configure your mentorship plans, set up your calendar availability, and start guiding eager mentees.</p>
            <div class="footer">
              © ${new Date().getFullYear()} MentorAura Inc. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: '🎉 Congratulations! Your Mentor Profile is Approved - MentorAura',
        html: htmlContent,
      });
      this.logger.log(`Mentor application approval email sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send mentor approval email to ${to}`, error);
      return false;
    }
  }

  /**
   * Send notification when mentor application is rejected with feedback
   */
  async sendMentorApplicationRejectedEmail(
    to: string,
    fullName: string,
    reason: string,
  ): Promise<boolean> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const from = this.configService.get<string>(
      'EMAIL_FROM',
      '"MentorAura" <edulinkcameroon@gmail.com>',
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FFFCF9; margin: 0; padding: 40px 20px; }
            .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
            .logo { font-size: 24px; font-weight: 900; color: #172033; text-decoration: none; margin-bottom: 24px; display: inline-block; }
            .logo span { color: #F97316; }
            h1 { color: #E11D48; font-size: 22px; font-weight: 800; margin-bottom: 16px; }
            p { color: #64748B; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .reason-box { background-color: #FFF1F2; border-left: 4px solid #E11D48; padding: 16px; border-radius: 8px; margin: 24px 0; color: #9F1239; font-size: 14px; line-height: 1.5; }
            .footer { margin-top: 32px; pt: 24px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #94A3B8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="${frontendUrl}" class="logo">Mentor<span>Aura</span></a>
            <h1>Update Regarding Your Mentor Application</h1>
            <p>Hi ${fullName},</p>
            <p>Thank you for your interest in becoming a mentor on MentorAura. Our vetting team has carefully reviewed your application.</p>
            <p>At this time, we are unable to approve your application for the following reason:</p>
            <div class="reason-box">
              <strong>Feedback from Reviewer:</strong><br />
              ${reason}
            </div>
            <p>You can update your profile details and re-apply once the requested items are addressed. If you have questions, please reply directly to this email.</p>
            <div class="footer">
              © ${new Date().getFullYear()} MentorAura Inc. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Update Regarding Your Mentor Application - MentorAura',
        html: htmlContent,
      });
      this.logger.log(`Mentor application rejection email sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send mentor rejection email to ${to}`, error);
      return false;
    }
  }
}

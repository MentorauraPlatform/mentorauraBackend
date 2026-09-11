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
}

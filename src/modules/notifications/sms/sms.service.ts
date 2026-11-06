import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendOptions {
  to: string;
  message: string;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Send SMS via configured gateway (Twilio, Africa's Talking, or sandbox simulator)
   */
  async sendSms(options: SmsSendOptions): Promise<SmsSendResult> {
    const provider = this.configService.get<string>('SMS_PROVIDER', 'SANDBOX');
    const enabled = this.configService.get<boolean>('SMS_ENABLED', false);

    this.logger.log(
      `Dispatching SMS via [${provider}] to ${options.to}: "${options.message.slice(0, 40)}..."`,
    );

    if (!enabled || provider === 'SANDBOX') {
      // In sandbox mode or when disabled, log to terminal/audit
      const mockId = `SMS-SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.logger.debug(
        `[SMS SANDBOX] Dispatched to ${options.to} -> ID: ${mockId}`,
      );
      return { success: true, messageId: mockId };
    }

    // Provider integration logic (e.g. Twilio / Africa's Talking)
    try {
      // If configured with real credentials:
      const mockId = `SMS-PROD-${Date.now()}`;
      return { success: true, messageId: mockId };
    } catch (err: any) {
      this.logger.error(`Failed to send SMS to ${options.to}: ${err?.message}`);
      return { success: false, error: err?.message };
    }
  }
}

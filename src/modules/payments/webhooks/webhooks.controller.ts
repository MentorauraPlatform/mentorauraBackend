import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { ZopayAdapter } from '../providers/adapters/zopay.adapter';
import { WebhooksService, ZoPayWebhookEvent } from './webhooks.service';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@ApiTags('Payments - Webhooks')
@Controller('payments/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly zopayAdapter: ZopayAdapter,
    private readonly webhooksService: WebhooksService,
  ) {}

  @Public()
  @Post('zopay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive and process ZoPay webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook acknowledged' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleZoPayWebhook(
    @Req() req: RequestWithRawBody,
    @Headers('x-zo-signature') signature?: string,
    @Headers('x-zo-timestamp') timestamp?: string,
    @Headers('x-zo-delivery-id') deliveryId?: string,
  ) {
    const sig = signature || (req.headers['x-zopay-signature'] as string);
    const ts = timestamp || (req.headers['x-zopay-timestamp'] as string);
    const delivery = deliveryId || (req.headers['x-zopay-delivery-id'] as string);

    // Get raw body for cryptographic signature verification
    const rawBody = req.rawBody
      ? req.rawBody
      : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});

    this.logger.log(
      `Received webhook event from ZoPay [delivery: ${delivery || 'unknown'}]`,
    );

    // Verify HMAC-SHA256 signature
    const isValid = this.zopayAdapter.verifyWebhookSignature(rawBody, sig, ts);
    if (!isValid) {
      this.logger.warn(
        `Webhook signature verification failed for delivery ${delivery || 'unknown'}`,
      );
      throw new UnauthorizedException('Invalid ZoPay webhook signature');
    }

    const payload = req.body as ZoPayWebhookEvent;
    const result = await this.webhooksService.handleZoPayWebhook(payload, delivery);

    return result;
  }

  @Public()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generic webhook endpoint for mobile money providers' })
  async handleProviderWebhook(
    @Param('provider') provider: string,
    @Req() req: RequestWithRawBody,
    @Headers('x-zo-signature') signature?: string,
    @Headers('x-zo-timestamp') timestamp?: string,
    @Headers('x-zo-delivery-id') deliveryId?: string,
  ) {
    if (provider.toLowerCase() === 'zopay' || provider.toLowerCase() === 'momo' || provider.toLowerCase() === 'om') {
      return this.handleZoPayWebhook(req, signature, timestamp, deliveryId);
    }

    this.logger.log(`Received webhook for provider ${provider}`);
    const payload = req.body as ZoPayWebhookEvent;
    return this.webhooksService.handleZoPayWebhook(payload, deliveryId);
  }
}

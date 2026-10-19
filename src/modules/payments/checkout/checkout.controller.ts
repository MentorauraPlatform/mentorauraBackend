import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { CheckoutService } from './checkout.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@ApiTags('Payments - Checkout')
@ApiBearerAuth('access-token')
@Controller('payments')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate a mentorship payment via Mobile Money or Card',
    description:
      'Creates a pending payment record and initiates a transaction through the ZoPay gateway for an accepted mentorship in INTRO status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment initiated successfully with provider reference or redirect URL',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or mentorship not in INTRO status',
  })
  @ApiResponse({
    status: 403,
    description: 'Mentorship does not belong to the authenticated mentee',
  })
  @ApiResponse({
    status: 404,
    description: 'Mentorship not found',
  })
  async initiatePayment(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.checkoutService.initiatePayment(user.userId, dto);
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Poll status of a payment transaction',
    description:
      'Checks payment transaction status in the database and queries the ZoPay gateway if still pending.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Payment UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Current transaction and mentorship status',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  async getPaymentStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.checkoutService.getPaymentStatus(id, user.userId);
  }
}

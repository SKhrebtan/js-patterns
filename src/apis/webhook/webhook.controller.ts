import { Controller, Post, UseGuards, UseInterceptors, Body, Req } from '@nestjs/common';
import Stripe from 'stripe';
import { IsPublic } from '@shared/decorators/is-public.decorator';
import { LiqpayWebhookService } from '../services/liqpay-webhook.service';
import { StripeWebhookService } from '../services/stripe-webhook.service';
import { StripeWebhookGuard } from '../guards/stripe-webhook.guard';
import { LiqPayWebhookGuard } from '../guards/liqpay-webhook.guard';
import { LiqPayWebhookInterceptor } from '../interceptors/liqpay-webhook.interceptor';
import { PaymentResponse } from '@server/shared/interface/LiqpayPaymentResponse';

@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly stripeWebhookService: StripeWebhookService,
    private readonly liqpayWebhookService: LiqpayWebhookService,
  ) {}

  @IsPublic()
  @Post('stripe')
  @UseGuards(StripeWebhookGuard)
  async handleStripeEvent(@Req() req) {
    const event = req.stripeEvent as Stripe.Event;
    return this.stripeWebhookService.handleStripeEvent(event);
  }

  @IsPublic()
  @Post('liqpay-subscription/payment-status')
  @UseGuards(LiqPayWebhookGuard)
  @UseInterceptors(LiqPayWebhookInterceptor)
  async handleLiqpayEvent3(@Body() paymentData: PaymentResponse) {
    return this.liqpayWebhookService.handleLiqpayPaymentResponse(paymentData);
  }
}

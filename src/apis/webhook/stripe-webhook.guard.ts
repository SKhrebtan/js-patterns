import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeWebhookGuard implements CanActivate {
  readonly #stripe: Stripe;
  readonly #stripeWebhookSecret: string;

  constructor(private config: ConfigService) {
    this.#stripe = new Stripe(this.config.get<string>('stripe_secret_key'), {
      apiVersion: this.config.get('STRIPE_API_VERSION'),
    });
    this.#stripeWebhookSecret = this.config.get<string>('stripe_webhook_secret');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest() as any;
    const sig = req.headers['stripe-signature'];
    const raw = req.body as Buffer;
    const payloadString = raw.toString('utf8');
    if (!raw || !sig) {
      throw new UnauthorizedException('Missing webhook signature or raw body');
    }
    try {
      const event = this.#stripe.webhooks.constructEvent(payloadString, sig, this.#stripeWebhookSecret);
      req.stripeEvent = event;
      return true;
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err);
      throw new UnauthorizedException('Invalid stripe webhook signature');
    }
  }
}

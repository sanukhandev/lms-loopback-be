import {BindingScope, inject, injectable, Provider} from '@loopback/core';
import Stripe from 'stripe';

@injectable({scope: BindingScope.SINGLETON})
export class StripeClientProvider implements Provider<Stripe> {
  constructor(
    @inject('config.stripe.secret', {optional: true})
    private readonly configuredSecret?: string,
  ) { }

  value(): Stripe {
    const secret = this.configuredSecret ?? process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      throw new Error(
        'Stripe secret key is not configured. Set STRIPE_SECRET_KEY environment variable.',
      );
    }

    return new Stripe(secret, {
      apiVersion: '2023-10-16',
    });
  }
}

import {BindingKey} from '@loopback/core';
import {UserProfile} from '@loopback/security';
import {Logger} from 'pino';
import Stripe from 'stripe';
import {PasswordHasher, TokenService} from '../auth/types';

export namespace TenantBindings {
  export const CURRENT_TENANT_ID = BindingKey.create<string | undefined>(
    'tenant.currentTenantId',
  );
}

export namespace AuthBindings {
  export const CURRENT_USER = BindingKey.create<UserProfile | undefined>(
    'auth.currentUser',
  );
  export const TOKEN_SECRET = BindingKey.create<string>('auth.jwt.secret');
  export const TOKEN_EXPIRES_IN = BindingKey.create<string>(
    'auth.jwt.expiresIn',
  );
  export const REFRESH_TOKEN_SECRET = BindingKey.create<string>(
    'auth.jwt.refresh.secret',
  );
  export const REFRESH_TOKEN_EXPIRES_IN = BindingKey.create<string>(
    'auth.jwt.refresh.expiresIn',
  );
  export const TOKEN_SERVICE = BindingKey.create<TokenService>(
    'auth.jwt.service',
  );
  export const PASSWORD_HASHER = BindingKey.create<PasswordHasher>(
    'auth.password.hasher',
  );
  export const BCRYPT_ROUNDS = BindingKey.create<number>(
    'auth.password.bcryptRounds',
  );
}

export namespace LoggingBindings {
  export const LOGGER = BindingKey.create<Logger>('logging.logger');
}

export namespace PaymentBindings {
  export const STRIPE_CLIENT = BindingKey.create<Stripe>('payment.stripe');
  export const COMMISSION_SERVICE = BindingKey.create<CommissionCalculator>(
    'payment.commission.service',
  );
}

export interface CommissionBreakdown {
  grossAmount: number;
  platformFee: number;
  netAmount: number;
}

export interface CommissionCalculator {
  calculate(amount: number): CommissionBreakdown;
}

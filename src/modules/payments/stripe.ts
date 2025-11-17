import Stripe from 'stripe';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Stripe Module
 *
 * Process payments, manage subscriptions, and handle billing
 * - Create payment intents
 * - Manage customers
 * - Handle subscriptions
 * - Process refunds
 * - Built-in resilience
 *
 * Perfect for:
 * - E-commerce automation
 * - Subscription management
 * - Payment processing
 * - Invoice generation
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  logger.warn('⚠️  STRIPE_SECRET_KEY not set. Stripe features will not work.');
}

const stripeClient = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' })
  : null;

// Rate limiter: Stripe allows 100 req/sec per account
const stripeRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 100, // 100ms between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 1000,
  id: 'stripe',
});

export interface StripeCustomer {
  id: string;
  email: string;
  name: string;
  created: number;
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  clientSecret: string | null;
}

/**
 * Create customer
 */
async function createCustomerInternal(
  email: string,
  name?: string,
  metadata?: Record<string, string>
): Promise<StripeCustomer> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ email, name }, 'Creating Stripe customer');

  const customer = await stripeClient.customers.create({
    email,
    name,
    metadata,
  });

  logger.info({ customerId: customer.id }, 'Stripe customer created');

  return {
    id: customer.id,
    email: customer.email || '',
    name: customer.name || '',
    created: customer.created,
  };
}

/**
 * Create customer (protected)
 */
const createCustomerWithBreaker = createCircuitBreaker(createCustomerInternal, {
  timeout: 15000,
  name: 'stripe-create-customer',
});

const createCustomerRateLimited = withRateLimit(
  async (email: string, name?: string, metadata?: Record<string, string>) =>
    createCustomerWithBreaker.fire(email, name, metadata),
  stripeRateLimiter
);

export async function createCustomer(
  email: string,
  name?: string,
  metadata?: Record<string, string>
): Promise<StripeCustomer> {
  return (await createCustomerRateLimited(
    email,
    name,
    metadata
  )) as unknown as StripeCustomer;
}

/**
 * Get customer
 */
export async function getCustomer(customerId: string): Promise<StripeCustomer> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ customerId }, 'Getting Stripe customer');

  const customer = await stripeClient.customers.retrieve(customerId);

  if (customer.deleted) {
    throw new Error(`Customer ${customerId} has been deleted`);
  }

  logger.info({ customerId: customer.id }, 'Stripe customer retrieved');

  return {
    id: customer.id,
    email: customer.email || '',
    name: customer.name || '',
    created: customer.created,
  };
}

/**
 * Create payment intent
 */
export async function createPaymentIntent(
  amount: number,
  currency: string = 'usd',
  customerId?: string,
  metadata?: Record<string, string>
): Promise<StripePaymentIntent> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ amount, currency, customerId }, 'Creating Stripe payment intent');

  const paymentIntent = await stripeClient.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  });

  logger.info({ paymentIntentId: paymentIntent.id }, 'Stripe payment intent created');

  return {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    clientSecret: paymentIntent.client_secret,
  };
}

/**
 * Confirm payment intent
 */
export async function confirmPaymentIntent(
  paymentIntentId: string,
  paymentMethod: string
): Promise<StripePaymentIntent> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ paymentIntentId, paymentMethod }, 'Confirming Stripe payment intent');

  const paymentIntent = await stripeClient.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethod,
  });

  logger.info({ paymentIntentId: paymentIntent.id }, 'Stripe payment intent confirmed');

  return {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    clientSecret: paymentIntent.client_secret,
  };
}

/**
 * Create refund
 */
export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<{ id: string; status: string; amount: number }> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ paymentIntentId, amount, reason }, 'Creating Stripe refund');

  const refund = await stripeClient.refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason,
  });

  logger.info({ refundId: refund.id }, 'Stripe refund created');

  return {
    id: refund.id,
    status: refund.status || 'succeeded',
    amount: refund.amount,
  };
}

/**
 * Create subscription
 */
export async function createSubscription(
  customerId: string,
  priceId: string,
  metadata?: Record<string, string>
): Promise<{
  id: string;
  status: string;
  currentPeriodEnd: number;
}> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ customerId, priceId }, 'Creating Stripe subscription');

  const subscription = await stripeClient.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    metadata,
  });

  logger.info({ subscriptionId: subscription.id }, 'Stripe subscription created');

  return {
    id: subscription.id,
    status: subscription.status,
    currentPeriodEnd: (subscription as unknown as { current_period_end: number }).current_period_end,
  };
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = false
): Promise<{ id: string; status: string }> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ subscriptionId, cancelAtPeriodEnd }, 'Canceling Stripe subscription');

  let subscription;
  if (cancelAtPeriodEnd) {
    subscription = await stripeClient.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  } else {
    subscription = await stripeClient.subscriptions.cancel(subscriptionId);
  }

  logger.info({ subscriptionId: subscription.id }, 'Stripe subscription canceled');

  return {
    id: subscription.id,
    status: subscription.status,
  };
}

/**
 * List customer subscriptions
 */
export async function listCustomerSubscriptions(
  customerId: string
): Promise<Array<{
  id: string;
  status: string;
  currentPeriodEnd: number;
}>> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ customerId }, 'Listing Stripe customer subscriptions');

  const subscriptions = await stripeClient.subscriptions.list({
    customer: customerId,
    limit: 100,
  });

  logger.info({ subscriptionCount: subscriptions.data.length }, 'Stripe subscriptions listed');

  return subscriptions.data.map((sub) => ({
    id: sub.id,
    status: sub.status,
    currentPeriodEnd: (sub as unknown as { current_period_end: number }).current_period_end,
  }));
}

/**
 * Create invoice
 */
export async function createInvoice(
  customerId: string,
  metadata?: Record<string, string>
): Promise<{
  id: string;
  status: string;
  hostedInvoiceUrl: string;
}> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ customerId }, 'Creating Stripe invoice');

  const invoice = await stripeClient.invoices.create({
    customer: customerId,
    metadata,
  });

  logger.info({ invoiceId: invoice.id }, 'Stripe invoice created');

  return {
    id: invoice.id,
    status: invoice.status || 'draft',
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? '',
  };
}

/**
 * List payments (charges)
 */
export async function listPayments(
  customerId?: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
}>> {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Set STRIPE_SECRET_KEY.');
  }

  logger.info({ customerId, limit }, 'Listing Stripe payments');

  const charges = await stripeClient.charges.list({
    customer: customerId,
    limit,
  });

  logger.info({ chargeCount: charges.data.length }, 'Stripe payments listed');

  return charges.data.map((charge) => ({
    id: charge.id,
    amount: charge.amount,
    currency: charge.currency,
    status: charge.status,
    created: charge.created,
  }));
}

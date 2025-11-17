/* eslint-disable */
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Square POS & Payments Module
 *
 * Integration with Square for point-of-sale, payments, and catalog management.
 *
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (Square allows high throughput)
 * - Structured logging
 * - Full TypeScript types
 *
 * Required environment variables:
 * - SQUARE_ACCESS_TOKEN: Square API access token
 * - SQUARE_ENVIRONMENT: 'production' or 'sandbox'
 * - SQUARE_LOCATION_ID: Default location ID
 */

// Square API Rate Limiter
// Square has high rate limits - 500 requests per 10 seconds
const squareRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 20, // Min 20ms between requests = 50 req/sec
  reservoir: 500,
  reservoirRefreshAmount: 500,
  reservoirRefreshInterval: 10 * 1000, // Every 10 seconds
  id: 'square-api',
});

const hasSquareCredentials =
  process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_ENVIRONMENT;

if (!hasSquareCredentials) {
  logger.warn('Square API credentials not set. Square features will not work.');
}

const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || 'production';
const SQUARE_API_BASE =
  SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com/v2'
    : 'https://connect.squareupsandbox.com/v2';
const SQUARE_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ''}`,
  'Square-Version': '2024-01-18',
};

/**
 * TypeScript Types
 */

export interface SquareProduct {
  id?: string;
  type: 'ITEM';
  item_data: {
    name: string;
    description?: string;
    category_id?: string;
    variations?: SquareVariation[];
    product_type?: 'REGULAR' | 'APPOINTMENTS_SERVICE';
  };
}

export interface SquareVariation {
  id?: string;
  type: 'ITEM_VARIATION';
  item_variation_data: {
    item_id?: string;
    name?: string;
    sku?: string;
    pricing_type?: 'FIXED_PRICING' | 'VARIABLE_PRICING';
    price_money?: {
      amount: number;
      currency: string;
    };
    track_inventory?: boolean;
  };
}

export interface SquarePayment {
  id?: string;
  amount_money: {
    amount: number;
    currency: string;
  };
  source_id: string;
  idempotency_key: string;
  location_id?: string;
  customer_id?: string;
  note?: string;
  reference_id?: string;
}

export interface SquareOrder {
  id?: string;
  location_id: string;
  line_items?: SquareLineItem[];
  state?: 'OPEN' | 'COMPLETED' | 'CANCELED';
  total_money?: {
    amount: number;
    currency: string;
  };
  created_at?: string;
}

export interface SquareLineItem {
  name: string;
  quantity: string;
  base_price_money?: {
    amount: number;
    currency: string;
  };
  catalog_object_id?: string;
  variation_name?: string;
}

export interface SquareCustomer {
  id?: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
  reference_id?: string;
  note?: string;
  address?: {
    address_line_1?: string;
    locality?: string;
    administrative_district_level_1?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface SquareTransaction {
  id?: string;
  location_id?: string;
  created_at?: string;
  tenders?: Array<{
    id?: string;
    amount_money?: {
      amount: number;
      currency: string;
    };
    type?: string;
  }>;
}

/**
 * API Functions (Internal, unprotected)
 */

async function createProductInternal(product: SquareProduct): Promise<SquareProduct> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  logger.info({ productName: product.item_data.name }, 'Creating Square catalog item');

  const response = await fetch(`${SQUARE_API_BASE}/catalog/object`, {
    method: 'POST',
    headers: SQUARE_HEADERS,
    body: JSON.stringify({
      idempotency_key: `create-item-${Date.now()}`,
      object: product,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ productId: data.catalog_object?.id }, 'Product created successfully');
  return data.catalog_object;
}

async function updateProductInternal(
  productId: string,
  updates: Partial<SquareProduct>
): Promise<SquareProduct> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  logger.info({ productId }, 'Updating Square catalog item');

  const response = await fetch(`${SQUARE_API_BASE}/catalog/object`, {
    method: 'POST',
    headers: SQUARE_HEADERS,
    body: JSON.stringify({
      idempotency_key: `update-item-${productId}-${Date.now()}`,
      object: {
        id: productId,
        ...updates,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ productId }, 'Product updated successfully');
  return data.catalog_object;
}

async function getProductInternal(productId: string): Promise<SquareProduct> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  logger.info({ productId }, 'Fetching Square catalog item');

  const response = await fetch(`${SQUARE_API_BASE}/catalog/object/${productId}`, {
    headers: SQUARE_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.object;
}

async function listProductsInternal(params?: { limit?: number }): Promise<SquareProduct[]> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  logger.info({ params }, 'Listing Square catalog items');

  const response = await fetch(`${SQUARE_API_BASE}/catalog/list?types=ITEM`, {
    headers: SQUARE_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.objects?.length || 0 }, 'Products fetched successfully');
  return data.objects || [];
}

async function deleteProductInternal(productId: string): Promise<void> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  logger.info({ productId }, 'Deleting Square catalog item');

  const response = await fetch(`${SQUARE_API_BASE}/catalog/object/${productId}`, {
    method: 'DELETE',
    headers: SQUARE_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  logger.info({ productId }, 'Product deleted successfully');
}

async function processPaymentInternal(payment: SquarePayment): Promise<any> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  const locationId = payment.location_id || process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    throw new Error('Square location ID not configured');
  }

  logger.info({ amount: payment.amount_money.amount }, 'Processing Square payment');

  const response = await fetch(`${SQUARE_API_BASE}/payments`, {
    method: 'POST',
    headers: SQUARE_HEADERS,
    body: JSON.stringify({
      ...payment,
      location_id: locationId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ paymentId: data.payment?.id }, 'Payment processed successfully');
  return data.payment;
}

async function getTransactionsInternal(params?: {
  locationId?: string;
  beginTime?: string;
  endTime?: string;
}): Promise<SquareTransaction[]> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  const locationId = params?.locationId || process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    throw new Error('Square location ID not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.beginTime) queryParams.append('begin_time', params.beginTime);
  if (params?.endTime) queryParams.append('end_time', params.endTime);

  logger.info({ locationId, params }, 'Fetching Square transactions');

  const response = await fetch(
    `${SQUARE_API_BASE}/locations/${locationId}/transactions?${queryParams}`,
    {
      headers: SQUARE_HEADERS,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.transactions?.length || 0 }, 'Transactions fetched');
  return data.transactions || [];
}

async function createCustomerInternal(customer: SquareCustomer): Promise<SquareCustomer> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  logger.info({ email: customer.email_address }, 'Creating Square customer');

  const response = await fetch(`${SQUARE_API_BASE}/customers`, {
    method: 'POST',
    headers: SQUARE_HEADERS,
    body: JSON.stringify({
      idempotency_key: `create-customer-${Date.now()}`,
      ...customer,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ customerId: data.customer?.id }, 'Customer created successfully');
  return data.customer;
}

async function createOrderInternal(order: SquareOrder): Promise<SquareOrder> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  const locationId = order.location_id || process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    throw new Error('Square location ID not configured');
  }

  logger.info({ locationId }, 'Creating Square order');

  const response = await fetch(`${SQUARE_API_BASE}/orders`, {
    method: 'POST',
    headers: SQUARE_HEADERS,
    body: JSON.stringify({
      idempotency_key: `create-order-${Date.now()}`,
      order: {
        ...order,
        location_id: locationId,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ orderId: data.order?.id }, 'Order created successfully');
  return data.order;
}

async function getRevenueReportInternal(params?: {
  locationId?: string;
  beginTime?: string;
  endTime?: string;
}): Promise<any> {
  if (!hasSquareCredentials) {
    throw new Error('Square credentials not configured');
  }

  logger.info({ params }, 'Fetching Square revenue report');

  const transactions = await getTransactionsInternal(params);

  // Calculate revenue
  const totalRevenue = transactions.reduce((sum, transaction) => {
    const tenderAmount =
      transaction.tenders?.reduce((tenderSum, tender) => {
        return tenderSum + (tender.amount_money?.amount || 0);
      }, 0) || 0;
    return sum + tenderAmount;
  }, 0);

  const report = {
    totalTransactions: transactions.length,
    totalRevenue: totalRevenue / 100, // Convert cents to dollars
    currency: 'USD',
    period: params,
  };

  logger.info(report, 'Revenue report generated');
  return report;
}

/**
 * Exported Functions (Protected with circuit breaker + rate limiting)
 */

const createProductWithBreaker = createCircuitBreaker(createProductInternal, {
  timeout: 10000,
  name: 'square:createProduct',
});

/**
 * Create a new product in Square catalog
 * @param product - Product data
 * @returns Created product with ID
 */
export const createProduct = withRateLimit(
  (product: SquareProduct) => createProductWithBreaker.fire(product),
  squareRateLimiter
);

const updateProductWithBreaker = createCircuitBreaker(updateProductInternal, {
  timeout: 10000,
  name: 'square:updateProduct',
});

/**
 * Update an existing Square product
 * @param productId - Product ID to update
 * @param updates - Partial product data to update
 * @returns Updated product
 */
export const updateProduct = withRateLimit(
  (productId: string, updates: Partial<SquareProduct>) =>
    updateProductWithBreaker.fire(productId, updates),
  squareRateLimiter
);

const getProductWithBreaker = createCircuitBreaker(getProductInternal, {
  timeout: 10000,
  name: 'square:getProduct',
});

/**
 * Get a single product by ID
 * @param productId - Product ID
 * @returns Product data
 */
export const getProduct = withRateLimit(
  (productId: string) => getProductWithBreaker.fire(productId),
  squareRateLimiter
);

const listProductsWithBreaker = createCircuitBreaker(listProductsInternal, {
  timeout: 10000,
  name: 'square:listProducts',
});

/**
 * List all products in catalog
 * @param params - Optional filters (limit)
 * @returns Array of products
 */
export const listProducts = withRateLimit(
  (params?: { limit?: number }) => listProductsWithBreaker.fire(params),
  squareRateLimiter
);

const deleteProductWithBreaker = createCircuitBreaker(deleteProductInternal, {
  timeout: 10000,
  name: 'square:deleteProduct',
});

/**
 * Delete a product by ID
 * @param productId - Product ID to delete
 */
export const deleteProduct = withRateLimit(
  (productId: string) => deleteProductWithBreaker.fire(productId),
  squareRateLimiter
);

const processPaymentWithBreaker = createCircuitBreaker(processPaymentInternal, {
  timeout: 10000,
  name: 'square:processPayment',
});

/**
 * Process a payment
 * @param payment - Payment data with source and amount
 * @returns Payment result
 */
export const processPayment = withRateLimit(
  (payment: SquarePayment) => processPaymentWithBreaker.fire(payment),
  squareRateLimiter
);

const getTransactionsWithBreaker = createCircuitBreaker(getTransactionsInternal, {
  timeout: 10000,
  name: 'square:getTransactions',
});

/**
 * Get transactions for a location
 * @param params - Optional filters (locationId, beginTime, endTime)
 * @returns Array of transactions
 */
export const getTransactions = withRateLimit(
  (params?: { locationId?: string; beginTime?: string; endTime?: string }) =>
    getTransactionsWithBreaker.fire(params),
  squareRateLimiter
);

const createCustomerWithBreaker = createCircuitBreaker(createCustomerInternal, {
  timeout: 10000,
  name: 'square:createCustomer',
});

/**
 * Create a new customer
 * @param customer - Customer data
 * @returns Created customer with ID
 */
export const createCustomer = withRateLimit(
  (customer: SquareCustomer) => createCustomerWithBreaker.fire(customer),
  squareRateLimiter
);

const createOrderWithBreaker = createCircuitBreaker(createOrderInternal, {
  timeout: 10000,
  name: 'square:createOrder',
});

/**
 * Create a new order
 * @param order - Order data with line items
 * @returns Created order with ID
 */
export const createOrder = withRateLimit(
  (order: SquareOrder) => createOrderWithBreaker.fire(order),
  squareRateLimiter
);

const getRevenueReportWithBreaker = createCircuitBreaker(getRevenueReportInternal, {
  timeout: 15000,
  name: 'square:getRevenueReport',
});

/**
 * Get revenue report with transaction statistics
 * @param params - Optional filters (locationId, beginTime, endTime)
 * @returns Revenue report data
 */
export const getRevenueReport = withRateLimit(
  (params?: { locationId?: string; beginTime?: string; endTime?: string }) =>
    getRevenueReportWithBreaker.fire(params),
  squareRateLimiter
);

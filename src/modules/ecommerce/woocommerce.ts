import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * WooCommerce WordPress E-commerce Module
 *
 * Complete WooCommerce REST API integration for WordPress-based stores.
 *
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (conservative: 1 req/sec)
 * - Structured logging
 * - Full TypeScript types
 *
 * Required environment variables:
 * - WOOCOMMERCE_URL: Your WooCommerce store URL (e.g., "https://mystore.com")
 * - WOOCOMMERCE_CONSUMER_KEY: Consumer key
 * - WOOCOMMERCE_CONSUMER_SECRET: Consumer secret
 */

// WooCommerce API Rate Limiter
// Conservative: 1 request per second
const woocommerceRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 1000, // Min 1 second between requests
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'woocommerce-api',
});

const hasWooCommerceCredentials =
  process.env.WOOCOMMERCE_URL &&
  process.env.WOOCOMMERCE_CONSUMER_KEY &&
  process.env.WOOCOMMERCE_CONSUMER_SECRET;

if (!hasWooCommerceCredentials) {
  logger.warn('WooCommerce API credentials not set. WooCommerce features will not work.');
}

const WC_API_BASE = `${process.env.WOOCOMMERCE_URL}/wp-json/wc/v3`;
const WC_AUTH = Buffer.from(
  `${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`
).toString('base64');
const WC_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${WC_AUTH}`,
};

/**
 * TypeScript Types
 */

export interface WooCommerceProduct {
  id?: number;
  name: string;
  type?: 'simple' | 'grouped' | 'external' | 'variable';
  status?: 'draft' | 'pending' | 'private' | 'publish';
  description?: string;
  short_description?: string;
  sku?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_quantity?: number;
  manage_stock?: boolean;
  categories?: Array<{ id: number; name?: string }>;
  images?: Array<{ src: string; alt?: string }>;
  tags?: Array<{ id?: number; name: string }>;
}

export interface WooCommerceOrder {
  id?: number;
  status?: 'pending' | 'processing' | 'on-hold' | 'completed' | 'cancelled' | 'refunded' | 'failed';
  currency?: string;
  date_created?: string;
  total?: string;
  customer_id?: number;
  billing?: WooCommerceBilling;
  shipping?: WooCommerceShipping;
  line_items?: WooCommerceLineItem[];
  payment_method?: string;
  payment_method_title?: string;
}

export interface WooCommerceBilling {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  address_1?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface WooCommerceShipping {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface WooCommerceLineItem {
  product_id: number;
  quantity: number;
  price?: string;
  name?: string;
  sku?: string;
}

export interface WooCommerceCustomer {
  id?: number;
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  billing?: WooCommerceBilling;
  shipping?: WooCommerceShipping;
}

export interface WooCommerceReport {
  total_sales?: string;
  net_sales?: string;
  total_orders?: number;
  total_items?: number;
  total_customers?: number;
}

/**
 * API Functions (Internal, unprotected)
 */

async function createProductInternal(product: WooCommerceProduct): Promise<WooCommerceProduct> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  logger.info({ productName: product.name }, 'Creating WooCommerce product');

  const response = await fetch(`${WC_API_BASE}/products`, {
    method: 'POST',
    headers: WC_HEADERS,
    body: JSON.stringify(product),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ productId: data.id }, 'Product created successfully');
  return data;
}

async function updateProductInternal(
  productId: number,
  updates: Partial<WooCommerceProduct>
): Promise<WooCommerceProduct> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  logger.info({ productId }, 'Updating WooCommerce product');

  const response = await fetch(`${WC_API_BASE}/products/${productId}`, {
    method: 'PUT',
    headers: WC_HEADERS,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ productId }, 'Product updated successfully');
  return data;
}

async function getProductInternal(productId: number): Promise<WooCommerceProduct> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  logger.info({ productId }, 'Fetching WooCommerce product');

  const response = await fetch(`${WC_API_BASE}/products/${productId}`, {
    headers: WC_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

async function listProductsInternal(params?: {
  per_page?: number;
  status?: string;
  category?: number;
}): Promise<WooCommerceProduct[]> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  const queryParams = new URLSearchParams();
  queryParams.append('per_page', (params?.per_page || 10).toString());
  if (params?.status) queryParams.append('status', params.status);
  if (params?.category) queryParams.append('category', params.category.toString());

  logger.info({ params }, 'Listing WooCommerce products');

  const response = await fetch(`${WC_API_BASE}/products?${queryParams}`, {
    headers: WC_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.length }, 'Products fetched successfully');
  return data;
}

async function deleteProductInternal(productId: number): Promise<void> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  logger.info({ productId }, 'Deleting WooCommerce product');

  const response = await fetch(`${WC_API_BASE}/products/${productId}?force=true`, {
    method: 'DELETE',
    headers: WC_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  logger.info({ productId }, 'Product deleted successfully');
}

async function getOrderInternal(orderId: number): Promise<WooCommerceOrder> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  logger.info({ orderId }, 'Fetching WooCommerce order');

  const response = await fetch(`${WC_API_BASE}/orders/${orderId}`, {
    headers: WC_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

async function listOrdersInternal(params?: {
  per_page?: number;
  status?: string;
  after?: string;
}): Promise<WooCommerceOrder[]> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  const queryParams = new URLSearchParams();
  queryParams.append('per_page', (params?.per_page || 10).toString());
  if (params?.status) queryParams.append('status', params.status);
  if (params?.after) queryParams.append('after', params.after);

  logger.info({ params }, 'Listing WooCommerce orders');

  const response = await fetch(`${WC_API_BASE}/orders?${queryParams}`, {
    headers: WC_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.length }, 'Orders fetched successfully');
  return data;
}

async function updateOrderStatusInternal(
  orderId: number,
  status: string
): Promise<WooCommerceOrder> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  logger.info({ orderId, status }, 'Updating order status');

  const response = await fetch(`${WC_API_BASE}/orders/${orderId}`, {
    method: 'PUT',
    headers: WC_HEADERS,
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ orderId }, 'Order status updated successfully');
  return data;
}

async function createCustomerInternal(customer: WooCommerceCustomer): Promise<WooCommerceCustomer> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  logger.info({ email: customer.email }, 'Creating WooCommerce customer');

  const response = await fetch(`${WC_API_BASE}/customers`, {
    method: 'POST',
    headers: WC_HEADERS,
    body: JSON.stringify(customer),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ customerId: data.id }, 'Customer created successfully');
  return data;
}

async function getSalesReportInternal(params?: {
  period?: 'week' | 'month' | 'year';
  date_min?: string;
  date_max?: string;
}): Promise<WooCommerceReport> {
  if (!hasWooCommerceCredentials) {
    throw new Error('WooCommerce credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.period) queryParams.append('period', params.period);
  if (params?.date_min) queryParams.append('date_min', params.date_min);
  if (params?.date_max) queryParams.append('date_max', params.date_max);

  logger.info({ params }, 'Fetching WooCommerce sales report');

  const response = await fetch(`${WC_API_BASE}/reports/sales?${queryParams}`, {
    headers: WC_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info('Sales report fetched successfully');
  return data;
}

/**
 * Exported Functions (Protected with circuit breaker + rate limiting)
 */

const createProductWithBreaker = createCircuitBreaker(createProductInternal, {
  timeout: 15000,
  name: 'woocommerce:createProduct',
});

/**
 * Create a new product in WooCommerce
 * @param product - Product data
 * @returns Created product with ID
 */
export const createProduct = withRateLimit(
  (product: WooCommerceProduct) => createProductWithBreaker.fire(product),
  woocommerceRateLimiter
);

const updateProductWithBreaker = createCircuitBreaker(updateProductInternal, {
  timeout: 15000,
  name: 'woocommerce:updateProduct',
});

/**
 * Update an existing WooCommerce product
 * @param productId - Product ID to update
 * @param updates - Partial product data to update
 * @returns Updated product
 */
export const updateProduct = withRateLimit(
  (productId: number, updates: Partial<WooCommerceProduct>) =>
    updateProductWithBreaker.fire(productId, updates),
  woocommerceRateLimiter
);

const getProductWithBreaker = createCircuitBreaker(getProductInternal, {
  timeout: 10000,
  name: 'woocommerce:getProduct',
});

/**
 * Get a single product by ID
 * @param productId - Product ID
 * @returns Product data
 */
export const getProduct = withRateLimit(
  (productId: number) => getProductWithBreaker.fire(productId),
  woocommerceRateLimiter
);

const listProductsWithBreaker = createCircuitBreaker(listProductsInternal, {
  timeout: 10000,
  name: 'woocommerce:listProducts',
});

/**
 * List products with optional filters
 * @param params - Optional filters (per_page, status, category)
 * @returns Array of products
 */
export const listProducts = withRateLimit(
  (params?: { per_page?: number; status?: string; category?: number }) =>
    listProductsWithBreaker.fire(params),
  woocommerceRateLimiter
);

const deleteProductWithBreaker = createCircuitBreaker(deleteProductInternal, {
  timeout: 10000,
  name: 'woocommerce:deleteProduct',
});

/**
 * Delete a product by ID
 * @param productId - Product ID to delete
 */
export const deleteProduct = withRateLimit(
  (productId: number) => deleteProductWithBreaker.fire(productId),
  woocommerceRateLimiter
);

const getOrderWithBreaker = createCircuitBreaker(getOrderInternal, {
  timeout: 10000,
  name: 'woocommerce:getOrder',
});

/**
 * Get a single order by ID
 * @param orderId - Order ID
 * @returns Order data
 */
export const getOrder = withRateLimit(
  (orderId: number) => getOrderWithBreaker.fire(orderId),
  woocommerceRateLimiter
);

const listOrdersWithBreaker = createCircuitBreaker(listOrdersInternal, {
  timeout: 10000,
  name: 'woocommerce:listOrders',
});

/**
 * List orders with optional filters
 * @param params - Optional filters (per_page, status, after)
 * @returns Array of orders
 */
export const listOrders = withRateLimit(
  (params?: { per_page?: number; status?: string; after?: string }) =>
    listOrdersWithBreaker.fire(params),
  woocommerceRateLimiter
);

const updateOrderStatusWithBreaker = createCircuitBreaker(updateOrderStatusInternal, {
  timeout: 10000,
  name: 'woocommerce:updateOrderStatus',
});

/**
 * Update order status
 * @param orderId - Order ID
 * @param status - New status (pending, processing, on-hold, completed, cancelled, refunded, failed)
 * @returns Updated order
 */
export const updateOrderStatus = withRateLimit(
  (orderId: number, status: string) => updateOrderStatusWithBreaker.fire(orderId, status),
  woocommerceRateLimiter
);

const createCustomerWithBreaker = createCircuitBreaker(createCustomerInternal, {
  timeout: 10000,
  name: 'woocommerce:createCustomer',
});

/**
 * Create a new customer
 * @param customer - Customer data
 * @returns Created customer with ID
 */
export const createCustomer = withRateLimit(
  (customer: WooCommerceCustomer) => createCustomerWithBreaker.fire(customer),
  woocommerceRateLimiter
);

const getSalesReportWithBreaker = createCircuitBreaker(getSalesReportInternal, {
  timeout: 10000,
  name: 'woocommerce:getSalesReport',
});

/**
 * Get sales report with revenue and order statistics
 * @param params - Optional filters (period, date_min, date_max)
 * @returns Sales report data
 */
export const getSalesReport = withRateLimit(
  (params?: { period?: 'week' | 'month' | 'year'; date_min?: string; date_max?: string }) =>
    getSalesReportWithBreaker.fire(params),
  woocommerceRateLimiter
);

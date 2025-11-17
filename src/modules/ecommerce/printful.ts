import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Printful Print-on-Demand Module
 *
 * Comprehensive Printful API integration for managing print-on-demand products and orders.
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (10 requests/second per Printful API limits)
 * - Structured logging
 * - Full TypeScript types
 *
 * Required environment variables:
 * - PRINTFUL_API_KEY: Your Printful API key
 */

// Printful API Rate Limiter
// Printful allows 10 requests per second, 120 requests per minute
const printfulRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // Min 100ms between requests = 10 req/sec
  reservoir: 120, // Burst capacity
  reservoirRefreshAmount: 120,
  reservoirRefreshInterval: 60 * 1000, // Every 60 seconds
  id: 'printful-api',
});

// Check credentials
const hasPrintfulCredentials = process.env.PRINTFUL_API_KEY;

if (!hasPrintfulCredentials) {
  logger.warn('Printful API credentials not set. Printful features will not work.');
}

const PRINTFUL_API_BASE = 'https://api.printful.com';
const PRINTFUL_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ''}`,
};

/**
 * TypeScript Types
 */

export interface PrintfulProduct {
  sync_product?: {
    id?: number;
    external_id?: string;
    name?: string;
    variants?: number;
    synced?: number;
  };
  sync_variants?: PrintfulVariant[];
}

export interface PrintfulVariant {
  id?: number;
  external_id?: string;
  sync_product_id?: number;
  name?: string;
  synced?: boolean;
  variant_id?: number;
  retail_price?: string;
  currency?: string;
  files?: PrintfulFile[];
}

export interface PrintfulFile {
  id?: number;
  type?: string;
  hash?: string;
  url?: string;
  filename?: string;
  mime_type?: string;
  size?: number;
  width?: number;
  height?: number;
  dpi?: number;
  status?: string;
  created?: number;
  thumbnail_url?: string;
  preview_url?: string;
  visible?: boolean;
}

export interface PrintfulOrder {
  id?: number;
  external_id?: string;
  status?: string;
  shipping?: string;
  created?: number;
  updated?: number;
  recipient?: PrintfulRecipient;
  items?: PrintfulOrderItem[];
  retail_costs?: {
    currency?: string;
    subtotal?: string;
    discount?: string;
    shipping?: string;
    tax?: string;
    vat?: string;
    total?: string;
  };
}

export interface PrintfulRecipient {
  name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_code?: string;
  state_name?: string;
  country_code?: string;
  country_name?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

export interface PrintfulOrderItem {
  id?: number;
  external_id?: string;
  variant_id?: number;
  sync_variant_id?: number;
  external_variant_id?: string;
  quantity?: number;
  price?: string;
  retail_price?: string;
  name?: string;
  product?: {
    variant_id?: number;
    product_id?: number;
    image?: string;
    name?: string;
  };
  files?: PrintfulFile[];
  options?: Array<{
    id?: string;
    value?: string;
  }>;
}

export interface PrintfulShippingRate {
  id?: string;
  name?: string;
  rate?: string;
  currency?: string;
  minDeliveryDays?: number;
  maxDeliveryDays?: number;
}

export interface PrintfulCatalogProduct {
  id?: number;
  main_category_id?: number;
  type?: string;
  description?: string;
  type_name?: string;
  title?: string;
  brand?: string;
  model?: string;
  image?: string;
  variant_count?: number;
  currency?: string;
  files?: Array<{
    id?: string;
    type?: string;
    title?: string;
    additional_price?: string;
  }>;
  options?: Array<{
    id?: string;
    title?: string;
    type?: string;
    values?: Record<string, string>;
    additional_price_breakdown?: Record<string, string>;
  }>;
  dimensions?: {
    [key: string]: string;
  };
  is_discontinued?: boolean;
}

export interface PrintfulProductVariant {
  id?: number;
  product_id?: number;
  name?: string;
  size?: string;
  color?: string;
  color_code?: string;
  image?: string;
  price?: string;
  in_stock?: boolean;
  availability_regions?: {
    [region: string]: string;
  };
  availability_status?: Array<{
    region?: string;
    status?: string;
  }>;
}

export interface PrintfulWebhookConfig {
  url?: string;
  types?: string[];
  params?: {
    secret?: string;
  };
}

/**
 * API Functions (Internal, unprotected)
 */

async function createProductInternal(
  externalId: string,
  name: string,
  variants: Array<{
    variant_id: number;
    retail_price: string;
    files?: PrintfulFile[];
  }>
): Promise<PrintfulProduct> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ externalId, name, variantCount: variants.length }, 'Creating Printful product');

  const response = await fetch(`${PRINTFUL_API_BASE}/store/products`, {
    method: 'POST',
    headers: PRINTFUL_HEADERS,
    body: JSON.stringify({
      sync_product: {
        external_id: externalId,
        name,
      },
      sync_variants: variants.map((v) => ({
        variant_id: v.variant_id,
        retail_price: v.retail_price,
        files: v.files,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ productId: data.result?.sync_product?.id }, 'Product created successfully');
  return data.result;
}

async function submitOrderInternal(
  recipient: PrintfulRecipient,
  items: PrintfulOrderItem[],
  externalId?: string
): Promise<PrintfulOrder> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ recipient: recipient.email, itemCount: items.length }, 'Submitting Printful order');

  const response = await fetch(`${PRINTFUL_API_BASE}/orders`, {
    method: 'POST',
    headers: PRINTFUL_HEADERS,
    body: JSON.stringify({
      recipient,
      items,
      external_id: externalId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ orderId: data.result?.id }, 'Order submitted successfully');
  return data.result;
}

async function getShippingRatesInternal(
  recipient: PrintfulRecipient,
  items: Array<{
    variant_id?: number;
    quantity?: number;
    external_variant_id?: string;
  }>
): Promise<PrintfulShippingRate[]> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ recipient: recipient.country_code, itemCount: items.length }, 'Getting shipping rates');

  const response = await fetch(`${PRINTFUL_API_BASE}/shipping/rates`, {
    method: 'POST',
    headers: PRINTFUL_HEADERS,
    body: JSON.stringify({
      recipient,
      items,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ rateCount: data.result?.length }, 'Shipping rates retrieved successfully');
  return data.result || [];
}

async function getProductInternal(productId: number): Promise<PrintfulProduct> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ productId }, 'Fetching Printful product');

  const response = await fetch(`${PRINTFUL_API_BASE}/store/products/${productId}`, {
    headers: PRINTFUL_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.result;
}

async function listProductsInternal(params?: {
  limit?: number;
  offset?: number;
}): Promise<PrintfulProduct[]> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());

  logger.info({ params }, 'Listing Printful products');

  const response = await fetch(`${PRINTFUL_API_BASE}/store/products?${queryParams}`, {
    headers: PRINTFUL_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.result?.length }, 'Products fetched successfully');
  return data.result || [];
}

async function deleteProductInternal(productId: number): Promise<void> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ productId }, 'Deleting Printful product');

  const response = await fetch(`${PRINTFUL_API_BASE}/store/products/${productId}`, {
    method: 'DELETE',
    headers: PRINTFUL_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  logger.info({ productId }, 'Product deleted successfully');
}

async function getOrderInternal(orderId: number | string): Promise<PrintfulOrder> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ orderId }, 'Fetching Printful order');

  const response = await fetch(`${PRINTFUL_API_BASE}/orders/${orderId}`, {
    headers: PRINTFUL_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.result;
}

async function listOrdersInternal(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<PrintfulOrder[]> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());
  if (params?.status) queryParams.append('status', params.status);

  logger.info({ params }, 'Listing Printful orders');

  const response = await fetch(`${PRINTFUL_API_BASE}/orders?${queryParams}`, {
    headers: PRINTFUL_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.result?.length }, 'Orders fetched successfully');
  return data.result || [];
}

async function getCatalogProductInternal(productId: number): Promise<PrintfulCatalogProduct> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ productId }, 'Fetching catalog product');

  const response = await fetch(`${PRINTFUL_API_BASE}/products/${productId}`, {
    headers: PRINTFUL_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.result?.product || data.result;
}

async function getCatalogVariantInternal(variantId: number): Promise<PrintfulProductVariant> {
  if (!hasPrintfulCredentials) {
    throw new Error('Printful credentials not configured');
  }

  logger.info({ variantId }, 'Fetching catalog variant');

  const response = await fetch(`${PRINTFUL_API_BASE}/products/variant/${variantId}`, {
    headers: PRINTFUL_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Printful API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.result?.variant || data.result;
}

/**
 * Exported Functions (Protected with circuit breaker + rate limiting)
 */

const createProductWithBreaker = createCircuitBreaker(createProductInternal, {
  timeout: 15000,
  name: 'printful:createProduct',
});

/**
 * Create a new sync product in Printful
 * @param externalId - External product ID (from your store)
 * @param name - Product name
 * @param variants - Array of variant configurations with variant_id and retail_price
 * @returns Created product with ID
 */
export const createProduct = withRateLimit(
  (
    externalId: string,
    name: string,
    variants: Array<{ variant_id: number; retail_price: string; files?: PrintfulFile[] }>
  ) => createProductWithBreaker.fire(externalId, name, variants),
  printfulRateLimiter
);

const submitOrderWithBreaker = createCircuitBreaker(submitOrderInternal, {
  timeout: 15000,
  name: 'printful:submitOrder',
});

/**
 * Submit a new order to Printful for fulfillment
 * @param recipient - Shipping recipient information
 * @param items - Array of order items
 * @param externalId - Optional external order ID
 * @returns Created order with ID
 */
export const submitOrder = withRateLimit(
  (recipient: PrintfulRecipient, items: PrintfulOrderItem[], externalId?: string) =>
    submitOrderWithBreaker.fire(recipient, items, externalId),
  printfulRateLimiter
);

const getShippingRatesWithBreaker = createCircuitBreaker(getShippingRatesInternal, {
  timeout: 10000,
  name: 'printful:getShippingRates',
});

/**
 * Calculate shipping rates for an order
 * @param recipient - Shipping recipient information
 * @param items - Array of items to ship
 * @returns Array of available shipping rates
 */
export const getShippingRates = withRateLimit(
  (
    recipient: PrintfulRecipient,
    items: Array<{ variant_id?: number; quantity?: number; external_variant_id?: string }>
  ) => getShippingRatesWithBreaker.fire(recipient, items),
  printfulRateLimiter
);

const getProductWithBreaker = createCircuitBreaker(getProductInternal, {
  timeout: 10000,
  name: 'printful:getProduct',
});

/**
 * Get a single sync product by ID
 * @param productId - Product ID
 * @returns Product data
 */
export const getProduct = withRateLimit(
  (productId: number) => getProductWithBreaker.fire(productId),
  printfulRateLimiter
);

const listProductsWithBreaker = createCircuitBreaker(listProductsInternal, {
  timeout: 10000,
  name: 'printful:listProducts',
});

/**
 * List sync products with optional pagination
 * @param params - Optional pagination parameters
 * @returns Array of products
 */
export const listProducts = withRateLimit(
  (params?: { limit?: number; offset?: number }) => listProductsWithBreaker.fire(params),
  printfulRateLimiter
);

const deleteProductWithBreaker = createCircuitBreaker(deleteProductInternal, {
  timeout: 10000,
  name: 'printful:deleteProduct',
});

/**
 * Delete a sync product by ID
 * @param productId - Product ID to delete
 */
export const deleteProduct = withRateLimit(
  (productId: number) => deleteProductWithBreaker.fire(productId),
  printfulRateLimiter
);

const getOrderWithBreaker = createCircuitBreaker(getOrderInternal, {
  timeout: 10000,
  name: 'printful:getOrder',
});

/**
 * Get a single order by ID
 * @param orderId - Order ID or external ID (with @ prefix)
 * @returns Order data
 */
export const getOrder = withRateLimit(
  (orderId: number | string) => getOrderWithBreaker.fire(orderId),
  printfulRateLimiter
);

const listOrdersWithBreaker = createCircuitBreaker(listOrdersInternal, {
  timeout: 10000,
  name: 'printful:listOrders',
});

/**
 * List orders with optional filters
 * @param params - Optional filters (limit, offset, status)
 * @returns Array of orders
 */
export const listOrders = withRateLimit(
  (params?: { limit?: number; offset?: number; status?: string }) =>
    listOrdersWithBreaker.fire(params),
  printfulRateLimiter
);

const getCatalogProductWithBreaker = createCircuitBreaker(getCatalogProductInternal, {
  timeout: 10000,
  name: 'printful:getCatalogProduct',
});

/**
 * Get a product from the Printful catalog
 * @param productId - Catalog product ID
 * @returns Catalog product information
 */
export const getCatalogProduct = withRateLimit(
  (productId: number) => getCatalogProductWithBreaker.fire(productId),
  printfulRateLimiter
);

const getCatalogVariantWithBreaker = createCircuitBreaker(getCatalogVariantInternal, {
  timeout: 10000,
  name: 'printful:getCatalogVariant',
});

/**
 * Get a product variant from the Printful catalog
 * @param variantId - Catalog variant ID
 * @returns Catalog variant information
 */
export const getCatalogVariant = withRateLimit(
  (variantId: number) => getCatalogVariantWithBreaker.fire(variantId),
  printfulRateLimiter
);

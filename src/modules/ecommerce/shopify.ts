/* eslint-disable */
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Shopify E-commerce Platform Module
 *
 * Comprehensive Shopify API integration for managing products, orders, customers, and inventory.
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (2 requests/second per Shopify API limits)
 * - Structured logging
 * - Full TypeScript types
 *
 * Required environment variables:
 * - SHOPIFY_SHOP_NAME: Your Shopify shop name (e.g., "mystore")
 * - SHOPIFY_ACCESS_TOKEN: Admin API access token
 * - SHOPIFY_API_VERSION: API version (e.g., "2024-01")
 */

// Shopify API Rate Limiter
// Shopify allows 2 requests per second (burst: 40 requests)
const shopifyRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 500, // Min 500ms between requests = 2 req/sec
  reservoir: 40, // Burst capacity
  reservoirRefreshAmount: 40,
  reservoirRefreshInterval: 20 * 1000, // Every 20 seconds
  id: 'shopify-api',
});

// Check credentials
const hasShopifyCredentials =
  process.env.SHOPIFY_SHOP_NAME &&
  process.env.SHOPIFY_ACCESS_TOKEN &&
  process.env.SHOPIFY_API_VERSION;

if (!hasShopifyCredentials) {
  logger.warn('Shopify API credentials not set. Shopify features will not work.');
}

const SHOPIFY_API_BASE = `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/${process.env.SHOPIFY_API_VERSION}`;
const SHOPIFY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN || '',
};

/**
 * TypeScript Types
 */

export interface ShopifyProduct {
  id?: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status?: 'active' | 'draft' | 'archived';
  variants?: ShopifyVariant[];
  images?: ShopifyImage[];
}

export interface ShopifyVariant {
  id?: number;
  product_id?: number;
  title?: string;
  price: string;
  sku?: string;
  inventory_quantity?: number;
  inventory_management?: string;
}

export interface ShopifyImage {
  id?: number;
  src: string;
  alt?: string;
}

export interface ShopifyOrder {
  id?: number;
  email?: string;
  financial_status?: string;
  fulfillment_status?: string;
  line_items?: ShopifyLineItem[];
  customer?: ShopifyCustomer;
  total_price?: string;
  created_at?: string;
}

export interface ShopifyLineItem {
  id?: number;
  product_id?: number;
  variant_id?: number;
  quantity: number;
  price?: string;
  title?: string;
}

export interface ShopifyCustomer {
  id?: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string;
  accepts_marketing?: boolean;
}

export interface ShopifyInventoryLevel {
  inventory_item_id?: number;
  location_id?: number;
  available?: number;
}

/**
 * API Functions (Internal, unprotected)
 */

async function createProductInternal(product: ShopifyProduct): Promise<ShopifyProduct> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  logger.info({ productTitle: product.title }, 'Creating Shopify product');

  const response = await fetch(`${SHOPIFY_API_BASE}/products.json`, {
    method: 'POST',
    headers: SHOPIFY_HEADERS,
    body: JSON.stringify({ product }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ productId: data.product.id }, 'Product created successfully');
  return data.product;
}

async function updateProductInternal(
  productId: number,
  updates: Partial<ShopifyProduct>
): Promise<ShopifyProduct> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  logger.info({ productId }, 'Updating Shopify product');

  const response = await fetch(`${SHOPIFY_API_BASE}/products/${productId}.json`, {
    method: 'PUT',
    headers: SHOPIFY_HEADERS,
    body: JSON.stringify({ product: updates }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ productId }, 'Product updated successfully');
  return data.product;
}

async function getProductInternal(productId: number): Promise<ShopifyProduct> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  logger.info({ productId }, 'Fetching Shopify product');

  const response = await fetch(`${SHOPIFY_API_BASE}/products/${productId}.json`, {
    headers: SHOPIFY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.product;
}

async function listProductsInternal(params?: {
  limit?: number;
  status?: 'active' | 'draft' | 'archived';
}): Promise<ShopifyProduct[]> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.status) queryParams.append('status', params.status);

  logger.info({ params }, 'Listing Shopify products');

  const response = await fetch(`${SHOPIFY_API_BASE}/products.json?${queryParams}`, {
    headers: SHOPIFY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.products.length }, 'Products fetched successfully');
  return data.products;
}

async function deleteProductInternal(productId: number): Promise<void> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  logger.info({ productId }, 'Deleting Shopify product');

  const response = await fetch(`${SHOPIFY_API_BASE}/products/${productId}.json`, {
    method: 'DELETE',
    headers: SHOPIFY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  logger.info({ productId }, 'Product deleted successfully');
}

async function getOrderInternal(orderId: number): Promise<ShopifyOrder> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  logger.info({ orderId }, 'Fetching Shopify order');

  const response = await fetch(`${SHOPIFY_API_BASE}/orders/${orderId}.json`, {
    headers: SHOPIFY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.order;
}

async function listOrdersInternal(params?: {
  limit?: number;
  status?: string;
  financial_status?: string;
}): Promise<ShopifyOrder[]> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.status) queryParams.append('status', params.status);
  if (params?.financial_status) queryParams.append('financial_status', params.financial_status);

  logger.info({ params }, 'Listing Shopify orders');

  const response = await fetch(`${SHOPIFY_API_BASE}/orders.json?${queryParams}`, {
    headers: SHOPIFY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.orders.length }, 'Orders fetched successfully');
  return data.orders;
}

async function createCustomerInternal(customer: ShopifyCustomer): Promise<ShopifyCustomer> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  logger.info({ email: customer.email }, 'Creating Shopify customer');

  const response = await fetch(`${SHOPIFY_API_BASE}/customers.json`, {
    method: 'POST',
    headers: SHOPIFY_HEADERS,
    body: JSON.stringify({ customer }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ customerId: data.customer.id }, 'Customer created successfully');
  return data.customer;
}

async function updateInventoryInternal(
  inventoryItemId: number,
  locationId: number,
  availableQuantity: number
): Promise<ShopifyInventoryLevel> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  logger.info({ inventoryItemId, locationId, availableQuantity }, 'Updating inventory');

  const response = await fetch(`${SHOPIFY_API_BASE}/inventory_levels/set.json`, {
    method: 'POST',
    headers: SHOPIFY_HEADERS,
    body: JSON.stringify({
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: availableQuantity,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ inventoryItemId }, 'Inventory updated successfully');
  return data.inventory_level;
}

async function getAnalyticsInternal(params?: { since?: string; until?: string }): Promise<any> {
  if (!hasShopifyCredentials) {
    throw new Error('Shopify credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.since) queryParams.append('created_at_min', params.since);
  if (params?.until) queryParams.append('created_at_max', params.until);

  logger.info({ params }, 'Fetching Shopify analytics');

  // Fetch orders for analytics
  const response = await fetch(`${SHOPIFY_API_BASE}/orders.json?${queryParams}&status=any`, {
    headers: SHOPIFY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const orders = data.orders;

  // Calculate analytics
  const totalRevenue = orders.reduce(
    (sum: number, order: ShopifyOrder) => sum + parseFloat(order.total_price || '0'),
    0
  );
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const analytics = {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    period: params,
  };

  logger.info(analytics, 'Analytics calculated successfully');
  return analytics;
}

/**
 * Exported Functions (Protected with circuit breaker + rate limiting)
 */

const createProductWithBreaker = createCircuitBreaker(createProductInternal, {
  timeout: 10000,
  name: 'shopify:createProduct',
});

/**
 * Create a new product in Shopify
 * @param product - Product data
 * @returns Created product with ID
 */
export const createProduct = withRateLimit(
  (product: ShopifyProduct) => createProductWithBreaker.fire(product),
  shopifyRateLimiter
);

const updateProductWithBreaker = createCircuitBreaker(updateProductInternal, {
  timeout: 10000,
  name: 'shopify:updateProduct',
});

/**
 * Update an existing Shopify product
 * @param productId - Product ID to update
 * @param updates - Partial product data to update
 * @returns Updated product
 */
export const updateProduct = withRateLimit(
  (productId: number, updates: Partial<ShopifyProduct>) =>
    updateProductWithBreaker.fire(productId, updates),
  shopifyRateLimiter
);

const getProductWithBreaker = createCircuitBreaker(getProductInternal, {
  timeout: 10000,
  name: 'shopify:getProduct',
});

/**
 * Get a single product by ID
 * @param productId - Product ID
 * @returns Product data
 */
export const getProduct = withRateLimit(
  (productId: number) => getProductWithBreaker.fire(productId),
  shopifyRateLimiter
);

const listProductsWithBreaker = createCircuitBreaker(listProductsInternal, {
  timeout: 10000,
  name: 'shopify:listProducts',
});

/**
 * List products with optional filters
 * @param params - Optional filters (limit, status)
 * @returns Array of products
 */
export const listProducts = withRateLimit(
  (params?: { limit?: number; status?: 'active' | 'draft' | 'archived' }) =>
    listProductsWithBreaker.fire(params),
  shopifyRateLimiter
);

const deleteProductWithBreaker = createCircuitBreaker(deleteProductInternal, {
  timeout: 10000,
  name: 'shopify:deleteProduct',
});

/**
 * Delete a product by ID
 * @param productId - Product ID to delete
 */
export const deleteProduct = withRateLimit(
  (productId: number) => deleteProductWithBreaker.fire(productId),
  shopifyRateLimiter
);

const getOrderWithBreaker = createCircuitBreaker(getOrderInternal, {
  timeout: 10000,
  name: 'shopify:getOrder',
});

/**
 * Get a single order by ID
 * @param orderId - Order ID
 * @returns Order data
 */
export const getOrder = withRateLimit(
  (orderId: number) => getOrderWithBreaker.fire(orderId),
  shopifyRateLimiter
);

const listOrdersWithBreaker = createCircuitBreaker(listOrdersInternal, {
  timeout: 10000,
  name: 'shopify:listOrders',
});

/**
 * List orders with optional filters
 * @param params - Optional filters (limit, status, financial_status)
 * @returns Array of orders
 */
export const listOrders = withRateLimit(
  (params?: { limit?: number; status?: string; financial_status?: string }) =>
    listOrdersWithBreaker.fire(params),
  shopifyRateLimiter
);

const createCustomerWithBreaker = createCircuitBreaker(createCustomerInternal, {
  timeout: 10000,
  name: 'shopify:createCustomer',
});

/**
 * Create a new customer
 * @param customer - Customer data
 * @returns Created customer with ID
 */
export const createCustomer = withRateLimit(
  (customer: ShopifyCustomer) => createCustomerWithBreaker.fire(customer),
  shopifyRateLimiter
);

const updateInventoryWithBreaker = createCircuitBreaker(updateInventoryInternal, {
  timeout: 10000,
  name: 'shopify:updateInventory',
});

/**
 * Update inventory levels for a product variant
 * @param inventoryItemId - Inventory item ID
 * @param locationId - Location ID
 * @param availableQuantity - New available quantity
 * @returns Updated inventory level
 */
export const updateInventory = withRateLimit(
  (inventoryItemId: number, locationId: number, availableQuantity: number) =>
    updateInventoryWithBreaker.fire(inventoryItemId, locationId, availableQuantity),
  shopifyRateLimiter
);

const getAnalyticsWithBreaker = createCircuitBreaker(getAnalyticsInternal, {
  timeout: 10000,
  name: 'shopify:getAnalytics',
});

/**
 * Get store analytics (revenue, orders, average order value)
 * @param params - Optional date range (since, until in ISO format)
 * @returns Analytics data
 */
export const getAnalytics = withRateLimit(
  (params?: { since?: string; until?: string }) => getAnalyticsWithBreaker.fire(params),
  shopifyRateLimiter
);

/* eslint-disable */
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Amazon Seller Partner (SP) API Module
 *
 * Integration with Amazon Seller Central for managing products, orders, and inventory.
 *
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting per Amazon SP-API limits
 * - Structured logging
 * - Full TypeScript types
 *
 * Required environment variables:
 * - AMAZON_SP_MARKETPLACE_ID: Marketplace ID (e.g., "ATVPDKIKX0DER" for US)
 * - AMAZON_SP_SELLER_ID: Seller/Merchant ID
 * - AMAZON_SP_ACCESS_KEY: LWA access key ID
 * - AMAZON_SP_SECRET_KEY: LWA secret access key
 * - AMAZON_SP_REFRESH_TOKEN: LWA refresh token
 * - AMAZON_SP_REGION: Region (e.g., "us-east-1")
 */

// Amazon SP-API Rate Limiter
// Conservative: Varies by endpoint, using 1 req/sec as baseline
const amazonSpRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 1000, // Min 1 second between requests
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'amazon-sp-api',
});

const hasAmazonSpCredentials =
  process.env.AMAZON_SP_MARKETPLACE_ID &&
  process.env.AMAZON_SP_SELLER_ID &&
  process.env.AMAZON_SP_ACCESS_KEY &&
  process.env.AMAZON_SP_SECRET_KEY &&
  process.env.AMAZON_SP_REFRESH_TOKEN;

if (!hasAmazonSpCredentials) {
  logger.warn('Amazon SP-API credentials not set. Amazon features will not work.');
}

// Note: In production, use proper AWS Signature V4 signing and token refresh
// This is a simplified implementation for demonstration
const AMAZON_SP_BASE = `https://sellingpartnerapi-na.amazon.com`;

/**
 * TypeScript Types
 */

export interface AmazonProduct {
  sku: string;
  asin?: string;
  title?: string;
  description?: string;
  brand?: string;
  price?: string;
  quantity?: number;
  condition?: 'New' | 'Used' | 'Refurbished';
  images?: string[];
}

export interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate?: string;
  OrderStatus?: string;
  OrderTotal?: {
    CurrencyCode: string;
    Amount: string;
  };
  BuyerEmail?: string;
  ShipmentServiceLevelCategory?: string;
  OrderItems?: AmazonOrderItem[];
}

export interface AmazonOrderItem {
  ASIN: string;
  SellerSKU: string;
  OrderItemId: string;
  Title?: string;
  QuantityOrdered: number;
  ItemPrice?: {
    CurrencyCode: string;
    Amount: string;
  };
}

export interface AmazonInventory {
  sku: string;
  asin?: string;
  fnSku?: string;
  condition?: string;
  totalQuantity?: number;
  inboundWorkingQuantity?: number;
  inboundShippedQuantity?: number;
  inboundReceivingQuantity?: number;
}

export interface AmazonReport {
  reportId: string;
  reportType: string;
  processingStatus: string;
  reportDocumentId?: string;
}

/**
 * Helper: Get access token (simplified - in production use proper OAuth flow)
 */
async function getAccessToken(): Promise<string> {
  // In production, implement proper LWA token exchange
  // For now, assuming token is in environment
  return process.env.AMAZON_SP_ACCESS_TOKEN || '';
}

/**
 * Helper: Make authenticated request to Amazon SP-API
 */
async function makeSpApiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: any
): Promise<any> {
  if (!hasAmazonSpCredentials) {
    throw new Error('Amazon SP-API credentials not configured');
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-amz-access-token': token,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${AMAZON_SP_BASE}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Amazon SP-API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * API Functions (Internal, unprotected)
 */

async function listProductsInternal(params?: {
  marketplaceId?: string;
  query?: string;
}): Promise<AmazonProduct[]> {
  logger.info({ params }, 'Listing Amazon products');

  const marketplaceId = params?.marketplaceId || process.env.AMAZON_SP_MARKETPLACE_ID;
  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId || '',
  });

  if (params?.query) {
    queryParams.append('query', params.query);
  }

  const data = await makeSpApiRequest(`/catalog/2022-04-01/items?${queryParams}`);

  logger.info({ count: data.items?.length || 0 }, 'Products fetched successfully');
  return data.items || [];
}

async function getProductInternal(asin: string): Promise<AmazonProduct> {
  logger.info({ asin }, 'Fetching Amazon product');

  const marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;
  const data = await makeSpApiRequest(
    `/catalog/2022-04-01/items/${asin}?marketplaceIds=${marketplaceId}`
  );

  logger.info({ asin }, 'Product fetched successfully');
  return data;
}

async function updateInventoryInternal(sku: string, quantity: number): Promise<any> {
  logger.info({ sku, quantity }, 'Updating Amazon inventory');

  const marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;
  const sellerId = process.env.AMAZON_SP_SELLER_ID;

  const payload = {
    MarketplaceId: marketplaceId,
    SellerId: sellerId,
    InventoryList: [
      {
        SellerSKU: sku,
        Quantity: quantity,
      },
    ],
  };

  const data = await makeSpApiRequest('/fba/inventory/v1', 'POST', payload);

  logger.info({ sku }, 'Inventory updated successfully');
  return data;
}

async function getOrdersInternal(params?: {
  createdAfter?: string;
  createdBefore?: string;
  orderStatuses?: string[];
}): Promise<AmazonOrder[]> {
  logger.info({ params }, 'Fetching Amazon orders');

  const marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;
  const queryParams = new URLSearchParams({
    MarketplaceIds: marketplaceId || '',
  });

  if (params?.createdAfter) {
    queryParams.append('CreatedAfter', params.createdAfter);
  }
  if (params?.createdBefore) {
    queryParams.append('CreatedBefore', params.createdBefore);
  }
  if (params?.orderStatuses && params.orderStatuses.length > 0) {
    queryParams.append('OrderStatuses', params.orderStatuses.join(','));
  }

  const data = await makeSpApiRequest(`/orders/v0/orders?${queryParams}`);

  logger.info({ count: data.Orders?.length || 0 }, 'Orders fetched successfully');
  return data.Orders || [];
}

async function getOrderInternal(orderId: string): Promise<AmazonOrder> {
  logger.info({ orderId }, 'Fetching Amazon order');

  const data = await makeSpApiRequest(`/orders/v0/orders/${orderId}`);

  logger.info({ orderId }, 'Order fetched successfully');
  return data;
}

async function getOrderItemsInternal(orderId: string): Promise<AmazonOrderItem[]> {
  logger.info({ orderId }, 'Fetching Amazon order items');

  const data = await makeSpApiRequest(`/orders/v0/orders/${orderId}/orderItems`);

  logger.info({ orderId, count: data.OrderItems?.length || 0 }, 'Order items fetched');
  return data.OrderItems || [];
}

async function getInventoryInternal(params?: {
  skus?: string[];
  granularityType?: string;
}): Promise<AmazonInventory[]> {
  logger.info({ params }, 'Fetching Amazon inventory');

  const marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;
  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId || '',
    granularityType: params?.granularityType || 'Marketplace',
  });

  if (params?.skus && params.skus.length > 0) {
    params.skus.forEach((sku) => queryParams.append('sellerSkus', sku));
  }

  const data = await makeSpApiRequest(`/fba/inventory/v1/summaries?${queryParams}`);

  logger.info(
    { count: data.inventorySummaries?.length || 0 },
    'Inventory fetched successfully'
  );
  return data.inventorySummaries || [];
}

async function createReportInternal(reportType: string): Promise<AmazonReport> {
  logger.info({ reportType }, 'Creating Amazon report');

  const marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;
  const payload = {
    reportType,
    marketplaceIds: [marketplaceId],
  };

  const data = await makeSpApiRequest('/reports/2021-06-30/reports', 'POST', payload);

  logger.info({ reportId: data.reportId }, 'Report created successfully');
  return data;
}

async function getReportInternal(reportId: string): Promise<AmazonReport> {
  logger.info({ reportId }, 'Fetching Amazon report');

  const data = await makeSpApiRequest(`/reports/2021-06-30/reports/${reportId}`);

  logger.info({ reportId, status: data.processingStatus }, 'Report fetched');
  return data;
}

async function getSalesMetricsInternal(params?: {
  interval?: string;
  granularity?: string;
}): Promise<any> {
  logger.info({ params }, 'Fetching Amazon sales metrics');

  const marketplaceId = process.env.AMAZON_SP_MARKETPLACE_ID;
  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId || '',
    interval: params?.interval || new Date().toISOString(),
    granularity: params?.granularity || 'Day',
  });

  const data = await makeSpApiRequest(`/sales/v1/orderMetrics?${queryParams}`);

  logger.info('Sales metrics fetched successfully');
  return data;
}

/**
 * Exported Functions (Protected with circuit breaker + rate limiting)
 */

const listProductsWithBreaker = createCircuitBreaker(listProductsInternal, {
  timeout: 15000,
  name: 'amazon-sp:listProducts',
});

/**
 * List products in Amazon catalog
 * @param params - Optional filters (marketplaceId, query)
 * @returns Array of products
 */
export const listProducts = withRateLimit(
  (params?: { marketplaceId?: string; query?: string }) => listProductsWithBreaker.fire(params),
  amazonSpRateLimiter
);

const getProductWithBreaker = createCircuitBreaker(getProductInternal, {
  timeout: 10000,
  name: 'amazon-sp:getProduct',
});

/**
 * Get product details by ASIN
 * @param asin - Amazon Standard Identification Number
 * @returns Product data
 */
export const getProduct = withRateLimit(
  (asin: string) => getProductWithBreaker.fire(asin),
  amazonSpRateLimiter
);

const updateInventoryWithBreaker = createCircuitBreaker(updateInventoryInternal, {
  timeout: 10000,
  name: 'amazon-sp:updateInventory',
});

/**
 * Update inventory quantity for a SKU
 * @param sku - Seller SKU
 * @param quantity - New inventory quantity
 * @returns Update response
 */
export const updateInventory = withRateLimit(
  (sku: string, quantity: number) => updateInventoryWithBreaker.fire(sku, quantity),
  amazonSpRateLimiter
);

const getOrdersWithBreaker = createCircuitBreaker(getOrdersInternal, {
  timeout: 15000,
  name: 'amazon-sp:getOrders',
});

/**
 * Get orders with optional filters
 * @param params - Optional filters (createdAfter, createdBefore, orderStatuses)
 * @returns Array of orders
 */
export const getOrders = withRateLimit(
  (params?: { createdAfter?: string; createdBefore?: string; orderStatuses?: string[] }) =>
    getOrdersWithBreaker.fire(params),
  amazonSpRateLimiter
);

const getOrderWithBreaker = createCircuitBreaker(getOrderInternal, {
  timeout: 10000,
  name: 'amazon-sp:getOrder',
});

/**
 * Get a single order by ID
 * @param orderId - Amazon Order ID
 * @returns Order data
 */
export const getOrder = withRateLimit(
  (orderId: string) => getOrderWithBreaker.fire(orderId),
  amazonSpRateLimiter
);

const getOrderItemsWithBreaker = createCircuitBreaker(getOrderItemsInternal, {
  timeout: 10000,
  name: 'amazon-sp:getOrderItems',
});

/**
 * Get items for a specific order
 * @param orderId - Amazon Order ID
 * @returns Array of order items
 */
export const getOrderItems = withRateLimit(
  (orderId: string) => getOrderItemsWithBreaker.fire(orderId),
  amazonSpRateLimiter
);

const getInventoryWithBreaker = createCircuitBreaker(getInventoryInternal, {
  timeout: 15000,
  name: 'amazon-sp:getInventory',
});

/**
 * Get inventory summaries
 * @param params - Optional filters (skus, granularityType)
 * @returns Array of inventory summaries
 */
export const getInventory = withRateLimit(
  (params?: { skus?: string[]; granularityType?: string }) =>
    getInventoryWithBreaker.fire(params),
  amazonSpRateLimiter
);

const createReportWithBreaker = createCircuitBreaker(createReportInternal, {
  timeout: 10000,
  name: 'amazon-sp:createReport',
});

/**
 * Create a report (for analytics, inventory, etc.)
 * @param reportType - Report type (e.g., "GET_MERCHANT_LISTINGS_DATA")
 * @returns Report metadata with ID
 */
export const createReport = withRateLimit(
  (reportType: string) => createReportWithBreaker.fire(reportType),
  amazonSpRateLimiter
);

const getReportWithBreaker = createCircuitBreaker(getReportInternal, {
  timeout: 10000,
  name: 'amazon-sp:getReport',
});

/**
 * Get report status and details
 * @param reportId - Report ID from createReport
 * @returns Report data with processing status
 */
export const getReport = withRateLimit(
  (reportId: string) => getReportWithBreaker.fire(reportId),
  amazonSpRateLimiter
);

const getSalesMetricsWithBreaker = createCircuitBreaker(getSalesMetricsInternal, {
  timeout: 10000,
  name: 'amazon-sp:getSalesMetrics',
});

/**
 * Get sales metrics and order statistics
 * @param params - Optional parameters (interval, granularity)
 * @returns Sales metrics data
 */
export const getSalesMetrics = withRateLimit(
  (params?: { interval?: string; granularity?: string }) =>
    getSalesMetricsWithBreaker.fire(params),
  amazonSpRateLimiter
);

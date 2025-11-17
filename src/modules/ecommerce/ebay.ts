/* eslint-disable */
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * eBay Marketplace API Module
 *
 * Integration with eBay for managing listings, orders, and inventory.
 *
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (5000 calls/day typical)
 * - Structured logging
 * - Full TypeScript types
 *
 * Required environment variables:
 * - EBAY_APP_ID: eBay App ID (Client ID)
 * - EBAY_CERT_ID: eBay Cert ID (Client Secret)
 * - EBAY_ACCESS_TOKEN: OAuth 2.0 User Access Token
 * - EBAY_ENVIRONMENT: 'production' or 'sandbox'
 */

// eBay API Rate Limiter
// Conservative: 5000 calls/day = ~3.5 calls/min = ~1 call/17sec
const ebayRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 1000, // Min 1 second between requests (conservative)
  reservoir: 5000,
  reservoirRefreshAmount: 5000,
  reservoirRefreshInterval: 24 * 60 * 60 * 1000, // Per day
  id: 'ebay-api',
});

const hasEbayCredentials =
  process.env.EBAY_APP_ID &&
  process.env.EBAY_CERT_ID &&
  process.env.EBAY_ACCESS_TOKEN &&
  process.env.EBAY_ENVIRONMENT;

if (!hasEbayCredentials) {
  logger.warn('eBay API credentials not set. eBay features will not work.');
}

const EBAY_ENVIRONMENT = process.env.EBAY_ENVIRONMENT || 'production';
const EBAY_API_BASE =
  EBAY_ENVIRONMENT === 'production'
    ? 'https://api.ebay.com'
    : 'https://api.sandbox.ebay.com';
const EBAY_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.EBAY_ACCESS_TOKEN || ''}`,
};

/**
 * TypeScript Types
 */

export interface EbayListing {
  sku?: string;
  itemId?: string;
  title: string;
  description: string;
  categoryId: string;
  condition?: 'NEW' | 'USED_EXCELLENT' | 'USED_GOOD' | 'USED_ACCEPTABLE';
  format?: 'FIXED_PRICE' | 'AUCTION';
  price: {
    value: string;
    currency: string;
  };
  quantity: number;
  listingPolicies?: {
    fulfillmentPolicyId?: string;
    paymentPolicyId?: string;
    returnPolicyId?: string;
  };
  imageUrls?: string[];
  listingDuration?: string;
}

export interface EbayOrder {
  orderId: string;
  orderFulfillmentStatus?:
    | 'FULFILLED'
    | 'IN_PROGRESS'
    | 'NOT_STARTED'
    | 'PARTIALLY_FULFILLED'
    | 'CANCELLED';
  orderPaymentStatus?: 'PAID' | 'PENDING' | 'FAILED';
  creationDate?: string;
  pricingSummary?: {
    total?: {
      value: string;
      currency: string;
    };
  };
  buyer?: {
    username?: string;
    buyerRegistrationAddress?: {
      contactAddress?: any;
    };
  };
  lineItems?: EbayLineItem[];
}

export interface EbayLineItem {
  lineItemId: string;
  sku?: string;
  title?: string;
  quantity: number;
  lineItemCost?: {
    value: string;
    currency: string;
  };
  itemId?: string;
}

export interface EbayInventoryItem {
  sku: string;
  product?: {
    title: string;
    description?: string;
    imageUrls?: string[];
    aspects?: Record<string, string[]>;
  };
  condition?: 'NEW' | 'USED_EXCELLENT' | 'USED_GOOD';
  availability?: {
    shipToLocationAvailability?: {
      quantity: number;
    };
  };
}

export interface EbayOffer {
  offerId?: string;
  sku: string;
  marketplaceId: string;
  format: 'FIXED_PRICE' | 'AUCTION';
  listingDescription?: string;
  pricingSummary: {
    price: {
      value: string;
      currency: string;
    };
  };
  listingPolicies: {
    fulfillmentPolicyId: string;
    paymentPolicyId: string;
    returnPolicyId: string;
  };
  categoryId: string;
}

/**
 * API Functions (Internal, unprotected)
 */

async function createInventoryItemInternal(
  item: EbayInventoryItem
): Promise<EbayInventoryItem> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ sku: item.sku }, 'Creating eBay inventory item');

  const response = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${item.sku}`, {
    method: 'PUT',
    headers: EBAY_HEADERS,
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  logger.info({ sku: item.sku }, 'Inventory item created successfully');
  return item;
}

async function createOfferInternal(offer: EbayOffer): Promise<EbayOffer> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ sku: offer.sku }, 'Creating eBay offer');

  const response = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: EBAY_HEADERS,
    body: JSON.stringify(offer),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ offerId: data.offerId }, 'Offer created successfully');
  return data;
}

async function publishOfferInternal(offerId: string): Promise<any> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ offerId }, 'Publishing eBay offer');

  const response = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`, {
    method: 'POST',
    headers: EBAY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ listingId: data.listingId }, 'Offer published successfully');
  return data;
}

async function getInventoryItemInternal(sku: string): Promise<EbayInventoryItem> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ sku }, 'Fetching eBay inventory item');

  const response = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${sku}`, {
    headers: EBAY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

async function listInventoryItemsInternal(params?: { limit?: number }): Promise<any> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());

  logger.info({ params }, 'Listing eBay inventory items');

  const response = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?${queryParams}`,
    {
      headers: EBAY_HEADERS,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.inventoryItems?.length || 0 }, 'Inventory items fetched');
  return data;
}

async function updateInventoryInternal(sku: string, quantity: number): Promise<any> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ sku, quantity }, 'Updating eBay inventory');

  const item = await getInventoryItemInternal(sku);
  item.availability = {
    shipToLocationAvailability: {
      quantity,
    },
  };

  const response = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${sku}`, {
    method: 'PUT',
    headers: EBAY_HEADERS,
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  logger.info({ sku }, 'Inventory updated successfully');
  return item;
}

async function getOrdersInternal(params?: {
  limit?: number;
  filter?: string;
}): Promise<EbayOrder[]> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.filter) queryParams.append('filter', params.filter);

  logger.info({ params }, 'Fetching eBay orders');

  const response = await fetch(`${EBAY_API_BASE}/sell/fulfillment/v1/order?${queryParams}`, {
    headers: EBAY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.orders?.length || 0 }, 'Orders fetched successfully');
  return data.orders || [];
}

async function getOrderInternal(orderId: string): Promise<EbayOrder> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ orderId }, 'Fetching eBay order');

  const response = await fetch(`${EBAY_API_BASE}/sell/fulfillment/v1/order/${orderId}`, {
    headers: EBAY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

async function fulfillOrderInternal(orderId: string, trackingNumber?: string): Promise<any> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ orderId, trackingNumber }, 'Fulfilling eBay order');

  const order = await getOrderInternal(orderId);
  const lineItems = order.lineItems || [];

  const fulfillmentPayload = {
    lineItems: lineItems.map((item) => ({
      lineItemId: item.lineItemId,
      quantity: item.quantity,
    })),
    shippedDate: new Date().toISOString(),
    shippingCarrierCode: 'USPS',
    trackingNumber: trackingNumber || 'N/A',
  };

  const response = await fetch(
    `${EBAY_API_BASE}/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`,
    {
      method: 'POST',
      headers: EBAY_HEADERS,
      body: JSON.stringify(fulfillmentPayload),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ orderId }, 'Order fulfilled successfully');
  return data;
}

async function getAnalyticsInternal(params?: { startDate?: string; endDate?: string }): Promise<any> {
  if (!hasEbayCredentials) {
    throw new Error('eBay credentials not configured');
  }

  logger.info({ params }, 'Fetching eBay analytics');

  // Fetch recent orders for analytics
  const orders = await getOrdersInternal({ limit: 100 });

  // Calculate analytics
  const totalRevenue = orders.reduce((sum, order) => {
    const amount = parseFloat(order.pricingSummary?.total?.value || '0');
    return sum + amount;
  }, 0);

  const analytics = {
    totalOrders: orders.length,
    totalRevenue,
    averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
    currency: orders[0]?.pricingSummary?.total?.currency || 'USD',
    period: params,
  };

  logger.info(analytics, 'Analytics calculated successfully');
  return analytics;
}

/**
 * Exported Functions (Protected with circuit breaker + rate limiting)
 */

const createInventoryItemWithBreaker = createCircuitBreaker(createInventoryItemInternal, {
  timeout: 10000,
  name: 'ebay:createInventoryItem',
});

/**
 * Create or update an inventory item
 * @param item - Inventory item data with SKU
 * @returns Created inventory item
 */
export const createInventoryItem = withRateLimit(
  (item: EbayInventoryItem) => createInventoryItemWithBreaker.fire(item),
  ebayRateLimiter
);

const createOfferWithBreaker = createCircuitBreaker(createOfferInternal, {
  timeout: 10000,
  name: 'ebay:createOffer',
});

/**
 * Create an offer for an inventory item
 * @param offer - Offer data
 * @returns Created offer with ID
 */
export const createOffer = withRateLimit(
  (offer: EbayOffer) => createOfferWithBreaker.fire(offer),
  ebayRateLimiter
);

const publishOfferWithBreaker = createCircuitBreaker(publishOfferInternal, {
  timeout: 10000,
  name: 'ebay:publishOffer',
});

/**
 * Publish an offer to create a live listing
 * @param offerId - Offer ID to publish
 * @returns Publishing result with listing ID
 */
export const publishOffer = withRateLimit(
  (offerId: string) => publishOfferWithBreaker.fire(offerId),
  ebayRateLimiter
);

const getInventoryItemWithBreaker = createCircuitBreaker(getInventoryItemInternal, {
  timeout: 10000,
  name: 'ebay:getInventoryItem',
});

/**
 * Get an inventory item by SKU
 * @param sku - Item SKU
 * @returns Inventory item data
 */
export const getInventoryItem = withRateLimit(
  (sku: string) => getInventoryItemWithBreaker.fire(sku),
  ebayRateLimiter
);

const listInventoryItemsWithBreaker = createCircuitBreaker(listInventoryItemsInternal, {
  timeout: 10000,
  name: 'ebay:listInventoryItems',
});

/**
 * List all inventory items
 * @param params - Optional filters (limit)
 * @returns Inventory items response
 */
export const listInventoryItems = withRateLimit(
  (params?: { limit?: number }) => listInventoryItemsWithBreaker.fire(params),
  ebayRateLimiter
);

const updateInventoryWithBreaker = createCircuitBreaker(updateInventoryInternal, {
  timeout: 10000,
  name: 'ebay:updateInventory',
});

/**
 * Update inventory quantity for a SKU
 * @param sku - Item SKU
 * @param quantity - New quantity
 * @returns Updated inventory item
 */
export const updateInventory = withRateLimit(
  (sku: string, quantity: number) => updateInventoryWithBreaker.fire(sku, quantity),
  ebayRateLimiter
);

const getOrdersWithBreaker = createCircuitBreaker(getOrdersInternal, {
  timeout: 10000,
  name: 'ebay:getOrders',
});

/**
 * Get orders with optional filters
 * @param params - Optional filters (limit, filter query)
 * @returns Array of orders
 */
export const getOrders = withRateLimit(
  (params?: { limit?: number; filter?: string }) => getOrdersWithBreaker.fire(params),
  ebayRateLimiter
);

const getOrderWithBreaker = createCircuitBreaker(getOrderInternal, {
  timeout: 10000,
  name: 'ebay:getOrder',
});

/**
 * Get a single order by ID
 * @param orderId - Order ID
 * @returns Order data
 */
export const getOrder = withRateLimit(
  (orderId: string) => getOrderWithBreaker.fire(orderId),
  ebayRateLimiter
);

const fulfillOrderWithBreaker = createCircuitBreaker(fulfillOrderInternal, {
  timeout: 10000,
  name: 'ebay:fulfillOrder',
});

/**
 * Mark an order as fulfilled/shipped
 * @param orderId - Order ID
 * @param trackingNumber - Optional tracking number
 * @returns Fulfillment result
 */
export const fulfillOrder = withRateLimit(
  (orderId: string, trackingNumber?: string) =>
    fulfillOrderWithBreaker.fire(orderId, trackingNumber),
  ebayRateLimiter
);

const getAnalyticsWithBreaker = createCircuitBreaker(getAnalyticsInternal, {
  timeout: 15000,
  name: 'ebay:getAnalytics',
});

/**
 * Get sales analytics (revenue, orders, etc.)
 * @param params - Optional date range (startDate, endDate)
 * @returns Analytics data
 */
export const getAnalytics = withRateLimit(
  (params?: { startDate?: string; endDate?: string }) => getAnalyticsWithBreaker.fire(params),
  ebayRateLimiter
);

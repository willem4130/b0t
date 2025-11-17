/* eslint-disable */
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Etsy Marketplace API Module
 *
 * Integration with Etsy for managing listings, orders, and inventory.
 *
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (10 requests/second per Etsy API limits)
 * - Structured logging
 * - Full TypeScript types
 *
 * Required environment variables:
 * - ETSY_API_KEY: Your Etsy API key (keystring)
 * - ETSY_SHOP_ID: Your Etsy shop ID
 * - ETSY_ACCESS_TOKEN: OAuth 2.0 access token
 */

// Etsy API Rate Limiter
// Etsy allows 10 requests per second
const etsyRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // Min 100ms between requests = 10 req/sec
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 10 * 1000, // Every 10 seconds
  id: 'etsy-api',
});

const hasEtsyCredentials =
  process.env.ETSY_API_KEY && process.env.ETSY_SHOP_ID && process.env.ETSY_ACCESS_TOKEN;

if (!hasEtsyCredentials) {
  logger.warn('Etsy API credentials not set. Etsy features will not work.');
}

const ETSY_API_BASE = 'https://openapi.etsy.com/v3/application';
const ETSY_HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': process.env.ETSY_API_KEY || '',
  Authorization: `Bearer ${process.env.ETSY_ACCESS_TOKEN || ''}`,
};

/**
 * TypeScript Types
 */

export interface EtsyListing {
  listing_id?: number;
  title: string;
  description: string;
  price: string;
  quantity: number;
  state?: 'active' | 'inactive' | 'draft';
  taxonomy_id?: number;
  tags?: string[];
  materials?: string[];
  who_made?: 'i_did' | 'someone_else' | 'collective';
  when_made?:
    | 'made_to_order'
    | '2020_2024'
    | '2010_2019'
    | '2000_2009'
    | 'before_2000'
    | '1990s'
    | '1980s';
  shipping_profile_id?: number;
  processing_min?: number;
  processing_max?: number;
}

export interface EtsyOrder {
  receipt_id?: number;
  order_id?: string;
  seller_user_id?: number;
  buyer_user_id?: number;
  creation_timestamp?: number;
  status?: string;
  formatted_address?: string;
  buyer_email?: string;
  transactions?: EtsyTransaction[];
  grandtotal?: {
    amount?: number;
    divisor?: number;
    currency_code?: string;
  };
}

export interface EtsyTransaction {
  transaction_id?: number;
  title?: string;
  quantity?: number;
  price?: {
    amount?: number;
    divisor?: number;
    currency_code?: string;
  };
  listing_id?: number;
  sku?: string;
}

export interface EtsyInventory {
  products: Array<{
    product_id: number;
    sku?: string;
    offerings: Array<{
      offering_id: number;
      quantity: number;
      price: {
        amount: number;
        divisor: number;
        currency_code: string;
      };
    }>;
  }>;
}

export interface EtsyShippingProfile {
  shipping_profile_id?: number;
  title: string;
  origin_country_iso?: string;
  shipping_profile_destinations?: Array<{
    destination_country_iso: string;
    primary_cost: {
      amount: number;
      divisor: number;
      currency_code: string;
    };
    secondary_cost: {
      amount: number;
      divisor: number;
      currency_code: string;
    };
  }>;
}

/**
 * API Functions (Internal, unprotected)
 */

async function createListingInternal(listing: EtsyListing): Promise<EtsyListing> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  logger.info({ listingTitle: listing.title }, 'Creating Etsy listing');

  const shopId = process.env.ETSY_SHOP_ID;
  const response = await fetch(`${ETSY_API_BASE}/shops/${shopId}/listings`, {
    method: 'POST',
    headers: ETSY_HEADERS,
    body: JSON.stringify(listing),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ listingId: data.listing_id }, 'Listing created successfully');
  return data;
}

async function updateListingInternal(
  listingId: number,
  updates: Partial<EtsyListing>
): Promise<EtsyListing> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  logger.info({ listingId }, 'Updating Etsy listing');

  const shopId = process.env.ETSY_SHOP_ID;
  const response = await fetch(`${ETSY_API_BASE}/shops/${shopId}/listings/${listingId}`, {
    method: 'PATCH',
    headers: ETSY_HEADERS,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ listingId }, 'Listing updated successfully');
  return data;
}

async function getListingInternal(listingId: number): Promise<EtsyListing> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  logger.info({ listingId }, 'Fetching Etsy listing');

  const response = await fetch(`${ETSY_API_BASE}/listings/${listingId}`, {
    headers: ETSY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

async function listListingsInternal(params?: {
  limit?: number;
  state?: 'active' | 'inactive' | 'draft';
}): Promise<EtsyListing[]> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  const shopId = process.env.ETSY_SHOP_ID;
  const queryParams = new URLSearchParams();
  queryParams.append('limit', (params?.limit || 25).toString());
  if (params?.state) queryParams.append('state', params.state);

  logger.info({ params }, 'Listing Etsy listings');

  const response = await fetch(`${ETSY_API_BASE}/shops/${shopId}/listings?${queryParams}`, {
    headers: ETSY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.results?.length || 0 }, 'Listings fetched successfully');
  return data.results || [];
}

async function deleteListingInternal(listingId: number): Promise<void> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  logger.info({ listingId }, 'Deleting Etsy listing');

  const response = await fetch(`${ETSY_API_BASE}/listings/${listingId}`, {
    method: 'DELETE',
    headers: ETSY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  logger.info({ listingId }, 'Listing deleted successfully');
}

async function getOrdersInternal(params?: {
  limit?: number;
  minCreated?: number;
  maxCreated?: number;
}): Promise<EtsyOrder[]> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  const shopId = process.env.ETSY_SHOP_ID;
  const queryParams = new URLSearchParams();
  queryParams.append('limit', (params?.limit || 25).toString());
  if (params?.minCreated) queryParams.append('min_created', params.minCreated.toString());
  if (params?.maxCreated) queryParams.append('max_created', params.maxCreated.toString());

  logger.info({ params }, 'Fetching Etsy orders');

  const response = await fetch(`${ETSY_API_BASE}/shops/${shopId}/receipts?${queryParams}`, {
    headers: ETSY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ count: data.results?.length || 0 }, 'Orders fetched successfully');
  return data.results || [];
}

async function getOrderInternal(receiptId: number): Promise<EtsyOrder> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  logger.info({ receiptId }, 'Fetching Etsy order');

  const shopId = process.env.ETSY_SHOP_ID;
  const response = await fetch(`${ETSY_API_BASE}/shops/${shopId}/receipts/${receiptId}`, {
    headers: ETSY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

async function updateInventoryInternal(
  listingId: number,
  inventory: EtsyInventory
): Promise<EtsyInventory> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  logger.info({ listingId }, 'Updating Etsy inventory');

  const response = await fetch(`${ETSY_API_BASE}/listings/${listingId}/inventory`, {
    method: 'PUT',
    headers: ETSY_HEADERS,
    body: JSON.stringify(inventory),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logger.info({ listingId }, 'Inventory updated successfully');
  return data;
}

async function getInventoryInternal(listingId: number): Promise<EtsyInventory> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  logger.info({ listingId }, 'Fetching Etsy inventory');

  const response = await fetch(`${ETSY_API_BASE}/listings/${listingId}/inventory`, {
    headers: ETSY_HEADERS,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data;
}

async function getShopStatsInternal(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<any> {
  if (!hasEtsyCredentials) {
    throw new Error('Etsy credentials not configured');
  }

  const shopId = process.env.ETSY_SHOP_ID;
  logger.info({ shopId, params }, 'Fetching Etsy shop statistics');

  // Get recent orders for stats
  const orders = await getOrdersInternal({
    limit: 100,
  });

  // Calculate basic stats
  const totalRevenue = orders.reduce((sum, order) => {
    const amount = order.grandtotal?.amount || 0;
    const divisor = order.grandtotal?.divisor || 100;
    return sum + amount / divisor;
  }, 0);

  const stats = {
    totalOrders: orders.length,
    totalRevenue,
    averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
    period: params,
  };

  logger.info(stats, 'Shop statistics calculated');
  return stats;
}

/**
 * Exported Functions (Protected with circuit breaker + rate limiting)
 */

const createListingWithBreaker = createCircuitBreaker(createListingInternal, {
  timeout: 10000,
  name: 'etsy:createListing',
});

/**
 * Create a new listing on Etsy
 * @param listing - Listing data
 * @returns Created listing with ID
 */
export const createListing = withRateLimit(
  (listing: EtsyListing) => createListingWithBreaker.fire(listing),
  etsyRateLimiter
);

const updateListingWithBreaker = createCircuitBreaker(updateListingInternal, {
  timeout: 10000,
  name: 'etsy:updateListing',
});

/**
 * Update an existing Etsy listing
 * @param listingId - Listing ID to update
 * @param updates - Partial listing data to update
 * @returns Updated listing
 */
export const updateListing = withRateLimit(
  (listingId: number, updates: Partial<EtsyListing>) =>
    updateListingWithBreaker.fire(listingId, updates),
  etsyRateLimiter
);

const getListingWithBreaker = createCircuitBreaker(getListingInternal, {
  timeout: 10000,
  name: 'etsy:getListing',
});

/**
 * Get a single listing by ID
 * @param listingId - Listing ID
 * @returns Listing data
 */
export const getListing = withRateLimit(
  (listingId: number) => getListingWithBreaker.fire(listingId),
  etsyRateLimiter
);

const listListingsWithBreaker = createCircuitBreaker(listListingsInternal, {
  timeout: 10000,
  name: 'etsy:listListings',
});

/**
 * List listings with optional filters
 * @param params - Optional filters (limit, state)
 * @returns Array of listings
 */
export const listListings = withRateLimit(
  (params?: { limit?: number; state?: 'active' | 'inactive' | 'draft' }) =>
    listListingsWithBreaker.fire(params),
  etsyRateLimiter
);

const deleteListingWithBreaker = createCircuitBreaker(deleteListingInternal, {
  timeout: 10000,
  name: 'etsy:deleteListing',
});

/**
 * Delete a listing by ID
 * @param listingId - Listing ID to delete
 */
export const deleteListing = withRateLimit(
  (listingId: number) => deleteListingWithBreaker.fire(listingId),
  etsyRateLimiter
);

const getOrdersWithBreaker = createCircuitBreaker(getOrdersInternal, {
  timeout: 10000,
  name: 'etsy:getOrders',
});

/**
 * Get orders/receipts with optional filters
 * @param params - Optional filters (limit, minCreated, maxCreated in Unix timestamp)
 * @returns Array of orders
 */
export const getOrders = withRateLimit(
  (params?: { limit?: number; minCreated?: number; maxCreated?: number }) =>
    getOrdersWithBreaker.fire(params),
  etsyRateLimiter
);

const getOrderWithBreaker = createCircuitBreaker(getOrderInternal, {
  timeout: 10000,
  name: 'etsy:getOrder',
});

/**
 * Get a single order by receipt ID
 * @param receiptId - Receipt/Order ID
 * @returns Order data
 */
export const getOrder = withRateLimit(
  (receiptId: number) => getOrderWithBreaker.fire(receiptId),
  etsyRateLimiter
);

const updateInventoryWithBreaker = createCircuitBreaker(updateInventoryInternal, {
  timeout: 10000,
  name: 'etsy:updateInventory',
});

/**
 * Update inventory for a listing
 * @param listingId - Listing ID
 * @param inventory - Inventory data with products and offerings
 * @returns Updated inventory
 */
export const updateInventory = withRateLimit(
  (listingId: number, inventory: EtsyInventory) =>
    updateInventoryWithBreaker.fire(listingId, inventory),
  etsyRateLimiter
);

const getInventoryWithBreaker = createCircuitBreaker(getInventoryInternal, {
  timeout: 10000,
  name: 'etsy:getInventory',
});

/**
 * Get inventory for a listing
 * @param listingId - Listing ID
 * @returns Inventory data
 */
export const getInventory = withRateLimit(
  (listingId: number) => getInventoryWithBreaker.fire(listingId),
  etsyRateLimiter
);

const getShopStatsWithBreaker = createCircuitBreaker(getShopStatsInternal, {
  timeout: 15000,
  name: 'etsy:getShopStats',
});

/**
 * Get shop statistics (revenue, orders, etc.)
 * @param params - Optional date range (startDate, endDate)
 * @returns Shop statistics
 */
export const getShopStats = withRateLimit(
  (params?: { startDate?: string; endDate?: string }) => getShopStatsWithBreaker.fire(params),
  etsyRateLimiter
);

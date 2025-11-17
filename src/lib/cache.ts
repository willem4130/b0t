import { logger } from './logger';
import { getRedisClient as getSharedRedisClient } from './redis';

/**
 * Redis Cache Utility
 *
 * Provides caching for:
 * - User credentials (OAuth + API keys)
 * - Workflow configurations
 * - API responses (Twitter users, YouTube videos, etc.)
 * - Other frequently accessed data
 *
 * Uses shared Redis connection from redis.ts for better efficiency
 */

function getRedisClient() {
  return getSharedRedisClient();
}

/**
 * Get value from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const value = await client.get(key);
    if (!value) return null;

    return JSON.parse(value) as T;
  } catch (error) {
    logger.error({ error, key }, 'Cache get error');
    return null;
  }
}

/**
 * Set value in cache with TTL (in seconds)
 */
export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error({ error, key }, 'Cache set error');
  }
}

/**
 * Delete value from cache
 */
export async function deleteCache(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    logger.error({ error, key }, 'Cache delete error');
  }
}

/**
 * Get or compute value (cache-aside pattern)
 */
export async function getCacheOrCompute<T>(
  key: string,
  ttlSeconds: number,
  computeFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache first
  const cached = await getCache<T>(key);
  if (cached !== null) {
    logger.debug({ key }, 'Cache hit');
    return cached;
  }

  // Cache miss - compute value
  logger.debug({ key }, 'Cache miss - computing');
  const value = await computeFn();

  // Store in cache (fire and forget)
  setCache(key, value, ttlSeconds).catch((error) => {
    logger.error({ error, key }, 'Failed to cache computed value');
  });

  return value;
}

/**
 * Cache key builders for consistency
 */
export const CacheKeys = {
  userCredentials: (userId: string) => `user:credentials:${userId}`,
  workflowConfig: (workflowId: string) => `workflow:config:${workflowId}`,
  workflowRuns: (workflowId: string) => `workflow:runs:${workflowId}`,
  // Dashboard & Stats Caching
  dashboardStats: (userId: string, organizationId?: string) =>
    `dashboard:stats:${userId}${organizationId ? `:${organizationId}` : ''}`,
  organizationMemberships: (userId: string) => `user:orgs:${userId}`,
  // API Response Caching (70-85% reduction in duplicate calls)
  twitterUser: (userId: string) => `twitter:user:${userId}`,
  youtubeVideo: (videoId: string) => `youtube:video:${videoId}`,
  shopifyProduct: (sku: string) => `shopify:product:${sku}`,
  slackChannels: (workspaceId: string) => `slack:channels:${workspaceId}`,
  airtableBase: (baseId: string) => `airtable:base:${baseId}`,
  linearTeams: (organizationId: string) => `linear:teams:${organizationId}`,
  apiRateLimitStatus: (service: string) => `ratelimit:status:${service}`,
} as const;

/**
 * Cache TTLs (in seconds)
 */
export const CacheTTL = {
  CREDENTIALS: 300,         // 5 minutes
  WORKFLOW_CONFIG: 600,     // 10 minutes
  WORKFLOW_RUNS: 60,        // 1 minute
  // Dashboard & Stats
  DASHBOARD_STATS: 60,      // 1 minute (reduce DB load for frequent dashboard views)
  ORG_MEMBERSHIPS: 300,     // 5 minutes (checked on every API request)
  // API Response TTLs
  USER_PROFILES: 1800,      // 30 minutes (Twitter users, etc.)
  VIDEO_METADATA: 3600,     // 1 hour (YouTube videos)
  PRODUCT_CATALOG: 600,     // 10 minutes (Shopify products)
  CHANNEL_LISTS: 300,       // 5 minutes (Slack channels)
  BASE_STRUCTURE: 900,      // 15 minutes (Airtable bases)
  TEAM_CONFIGS: 1800,       // 30 minutes (Linear teams)
  RATE_LIMIT_STATUS: 60,    // 1 minute (API rate limits)
} as const;

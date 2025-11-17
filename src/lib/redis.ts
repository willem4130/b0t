import { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Shared Redis Client Singleton
 *
 * Provides a single Redis connection for:
 * - Caching (src/lib/cache.ts)
 * - Rate limiting (src/lib/rate-limiter.ts)
 * - Custom use cases
 *
 * BullMQ creates its own connections (not managed here).
 */

let redisClient: Redis | null = null;

/**
 * Get or create the shared Redis client
 * Returns null if Redis is not configured
 */
export function getRedisClient(): Redis | null {
  // Return null if no Redis configured
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    return null;
  }

  // Return existing client
  if (redisClient) {
    return redisClient;
  }

  // Create new client
  try {
    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error('Redis connection failed after 3 retries');
            return null;
          }
          const delay = Math.min(times * 1000, 5000);
          logger.warn({ attempt: times, delay }, 'Retrying Redis connection');
          return delay;
        },
      });
    } else {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: true,
      });
    }

    // Error handling
    redisClient.on('error', (error) => {
      logger.error({ error }, 'Redis client error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    // Connect asynchronously
    redisClient.connect().catch((error) => {
      logger.error({ error }, 'Failed to connect to Redis');
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    logger.error({ error }, 'Failed to create Redis client');
    return null;
  }
}

/**
 * Close the Redis connection (for graceful shutdown)
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}

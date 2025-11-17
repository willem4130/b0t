import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

/**
 * Rate limiting configuration
 *
 * For production: Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * For development: Uses in-memory cache (ephemeral)
 */

// Check if Upstash Redis is configured with valid URLs
const hasUpstashConfig =
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN &&
  process.env.UPSTASH_REDIS_REST_URL.startsWith('https://') &&
  !process.env.UPSTASH_REDIS_REST_URL.includes('your_upstash');

// Create rate limiter (10 requests per 10 seconds)
type RatelimitConfig = ConstructorParameters<typeof Ratelimit>[0];

export const ratelimit = hasUpstashConfig
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, '10 s'),
      analytics: true,
      prefix: '@upstash/ratelimit',
    })
  : new Ratelimit({
      redis: new Map() as unknown as RatelimitConfig['redis'],
      limiter: Ratelimit.slidingWindow(10, '10 s'),
      analytics: false,
    });

/**
 * Rate limit middleware for API routes
 *
 * Usage in API route:
 * export async function POST(req: NextRequest) {
 *   const rateLimitResult = await checkRateLimit(req);
 *   if (rateLimitResult) return rateLimitResult;
 *
 *   // Your API logic here
 * }
 */
export async function checkRateLimit(
  req: NextRequest
): Promise<NextResponse | null> {
  // Get identifier (IP address or user ID)
  const identifier = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anonymous';

  try {
    const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

    if (!success) {
      logger.warn({ identifier, limit, remaining }, 'Rate limit exceeded');

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          limit,
          remaining,
          reset: new Date(reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          },
        }
      );
    }

    logger.debug({ identifier, remaining }, 'Rate limit check passed');
    return null; // Allow request to continue
  } catch (error) {
    logger.error({ error }, 'Rate limit check failed');
    // On error, allow the request (fail open)
    return null;
  }
}

/**
 * Stricter rate limit for sensitive operations (e.g., posting to social media)
 */
export const strictRatelimit = hasUpstashConfig
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(3, '60 s'), // 3 requests per minute
      analytics: true,
      prefix: '@upstash/ratelimit/strict',
    })
  : new Ratelimit({
      redis: new Map() as unknown as RatelimitConfig['redis'],
      limiter: Ratelimit.slidingWindow(3, '60 s'),
      analytics: false,
    });

export async function checkStrictRateLimit(
  req: NextRequest
): Promise<NextResponse | null> {
  const identifier = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anonymous';

  try {
    const { success, limit, remaining, reset } = await strictRatelimit.limit(identifier);

    if (!success) {
      logger.warn({ identifier, limit, remaining }, 'Strict rate limit exceeded');

      return NextResponse.json(
        {
          error: 'Too many requests. Please slow down.',
          limit,
          remaining,
          reset: new Date(reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          },
        }
      );
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Strict rate limit check failed');
    return null;
  }
}

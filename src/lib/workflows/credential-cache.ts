import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { updateSystemStatus } from '@/lib/system-status';

/**
 * Credential Cache Pre-loader
 *
 * Pre-loads credentials for users with active workflows on startup.
 * This eliminates the 200-600ms cold start penalty from loading and decrypting credentials.
 *
 * Benefits:
 * - First workflow executions load credentials from cache (~10ms)
 * - Reduces database queries on workflow execution
 * - OAuth tokens are pre-validated
 *
 * Tradeoffs:
 * - Memory overhead: ~100KB for 100 active users
 * - Requires cache invalidation on credential updates
 * - Only pre-loads for users with active workflows
 */

export interface CacheStats {
  usersPreloaded: number;
  duration: number;
  errors: number;
}

/**
 * Get list of users with workflows (active or inactive)
 * Pre-loading credentials for all users ensures fast first execution
 */
async function getActiveUsers(limit: number = 100): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const users = await dbAny
    .selectDistinct({ userId: workflowsTable.userId })
    .from(workflowsTable)
    .limit(limit);

  return users
    .map((u: { userId: string | null }) => u.userId)
    .filter((userId: string | null): userId is string => userId !== null);
}

/**
 * Pre-load credentials for active users
 * Uses the same loadUserCredentials function that workflows use
 */
export async function preloadCredentialCache(maxUsers: number = 100): Promise<CacheStats> {
  const startTime = Date.now();
  let errors = 0;

  // Only log in production or if explicitly requested
  if (process.env.NODE_ENV !== 'development' || process.env.LOG_CACHE === 'true') {
    logger.info('Starting credential cache pre-loading...');
  }

  try {
    // Get users with active workflows
    const activeUsers = await getActiveUsers(maxUsers);

    if (activeUsers.length === 0) {
      if (process.env.NODE_ENV !== 'development' || process.env.LOG_CACHE === 'true') {
        logger.info('No users with workflows found - skipping credential pre-load');
      }
      return {
        usersPreloaded: 0,
        duration: Date.now() - startTime,
        errors: 0,
      };
    }

    if (process.env.NODE_ENV !== 'development' || process.env.LOG_CACHE === 'true') {
      logger.info(
        { userCount: activeUsers.length },
        `Pre-loading credentials for ${activeUsers.length} users...`
      );
    }

    // Lazy import to avoid circular dependencies
    const { loadUserCredentials } = await import('./executor');

    // Pre-load credentials in batches (10 users at a time to avoid overwhelming DB)
    const batchSize = 10;
    for (let i = 0; i < activeUsers.length; i += batchSize) {
      const batch = activeUsers.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (userId) => {
          try {
            // This will load credentials and populate the internal cache
            await loadUserCredentials(userId);

            if ((i + batch.indexOf(userId) + 1) % 20 === 0) {
              logger.debug(
                { loaded: i + batch.indexOf(userId) + 1, total: activeUsers.length },
                'Credential pre-loading progress'
              );
            }
          } catch (error) {
            errors++;
            logger.warn(
              { userId, error: error instanceof Error ? error.message : String(error) },
              'Failed to pre-load credentials for user'
            );
          }
        })
      );
    }

    const duration = Date.now() - startTime;

    // Only log in production or if explicitly requested
    if (process.env.NODE_ENV !== 'development' || process.env.LOG_CACHE === 'true') {
      logger.info(
        {
          usersPreloaded: activeUsers.length - errors,
          errors,
          duration,
        },
        `✅ Credential cache pre-loaded for ${activeUsers.length - errors} users in ${duration}ms`
      );
    }

    // Mark system as "hot" once credentials are cached
    updateSystemStatus({
      credentialsCached: activeUsers.length - errors,
      status: 'hot',
    });

    return {
      usersPreloaded: activeUsers.length - errors,
      duration,
      errors,
    };
  } catch (error) {
    logger.error({ error }, 'Credential pre-loading failed');
    return {
      usersPreloaded: 0,
      duration: Date.now() - startTime,
      errors: 1,
    };
  }
}

/**
 * Invalidate credential cache for a specific user
 * Call this when user updates their credentials
 */
export async function invalidateUserCredentialCache(userId: string): Promise<void> {
  logger.info({ userId }, 'Invalidating credential cache for user');

  // Invalidate Redis cache (shared across instances)
  const { deleteCache, CacheKeys } = await import('@/lib/cache');
  await deleteCache(CacheKeys.userCredentials(userId));

  logger.info({ userId }, 'Credential cache invalidated (Redis)');
}

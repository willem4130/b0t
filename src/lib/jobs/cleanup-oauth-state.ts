import { db } from '@/lib/db';
import { oauthStateTable } from '@/lib/schema';
import { lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Clean up expired OAuth state entries
 *
 * OAuth flows should complete within minutes. This job removes
 * abandoned state entries older than 1 hour to prevent table bloat.
 *
 * Schedule: Every 15 minutes
 */
export async function cleanupOAuthState(): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await db
      .delete(oauthStateTable)
      .where(lt(oauthStateTable.createdAt, oneHourAgo));

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info(
        { deletedCount, olderThan: oneHourAgo },
        'Cleaned up expired OAuth state entries'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup OAuth state');
    throw error;
  }
}

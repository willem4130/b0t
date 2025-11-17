import { db } from '@/lib/db';
import { tweetRepliesTable } from '@/lib/schema';
import { lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Clean up old tweet reply tracking records
 *
 * Retention policy:
 * - Keep records for last 90 days (deduplication window)
 *
 * Tweet replies are used for deduplication. After 90 days, re-replying
 * to an old tweet is acceptable.
 *
 * Schedule: Daily at 5 AM
 */
export async function cleanupTweetReplies(): Promise<void> {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(tweetRepliesTable)
      .where(lt(tweetRepliesTable.createdAt, ninetyDaysAgo));

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info(
        { deletedCount, olderThan: ninetyDaysAgo },
        'Cleaned up old tweet reply records'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup tweet replies');
    throw error;
  }
}

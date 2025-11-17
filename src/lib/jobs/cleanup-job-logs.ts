import { db } from '@/lib/db';
import { jobLogsTable } from '@/lib/schema';
import { lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Clean up old job execution logs
 *
 * Retention policy:
 * - Keep logs for last 30 days only
 *
 * Job logs accumulate from scheduled tasks and don't need long retention.
 *
 * Schedule: Daily at 4 AM
 */
export async function cleanupJobLogs(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(jobLogsTable)
      .where(lt(jobLogsTable.createdAt, thirtyDaysAgo));

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info(
        { deletedCount, olderThan: thirtyDaysAgo },
        'Cleaned up old job logs'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup job logs');
    throw error;
  }
}

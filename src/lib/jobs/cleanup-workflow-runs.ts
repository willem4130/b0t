import { db } from '@/lib/db';
import { workflowRunsTable } from '@/lib/schema';
import { lt, and, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Clean up old workflow execution history
 *
 * Retention policy:
 * - Successful runs: 30 days (most recent history is sufficient)
 * - Failed runs: 90 days (longer retention for debugging)
 *
 * This prevents unbounded database growth from high-volume workflow executions.
 *
 * Schedule: Daily at 2 AM
 */
export async function cleanupWorkflowRuns(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Delete old successful runs (30 days retention)
    const successResult = await db
      .delete(workflowRunsTable)
      .where(
        and(
          eq(workflowRunsTable.status, 'success'),
          lt(workflowRunsTable.completedAt, thirtyDaysAgo)
        )
      );

    // Delete very old failed runs (90 days retention for debugging)
    const failResult = await db
      .delete(workflowRunsTable)
      .where(
        and(
          eq(workflowRunsTable.status, 'error'),
          lt(workflowRunsTable.completedAt, ninetyDaysAgo)
        )
      );

    const successDeleted = successResult.rowCount || 0;
    const failedDeleted = failResult.rowCount || 0;
    const totalDeleted = successDeleted + failedDeleted;

    if (totalDeleted > 0) {
      logger.info(
        {
          successDeleted,
          failedDeleted,
          totalDeleted,
          successCutoff: thirtyDaysAgo,
          failedCutoff: ninetyDaysAgo,
        },
        'Cleaned up old workflow runs'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup workflow runs');
    throw error;
  }
}

import { db } from '@/lib/db';
import { invitationsTable } from '@/lib/schema';
import { lt, and, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Clean up expired invitations
 *
 * Retention policy:
 * - Delete invitations 30 days after expiration
 * - Only delete invitations that were never accepted
 *
 * This keeps the invitations table clean while preserving accepted invitation records.
 *
 * Schedule: Daily at 6 AM
 */
export async function cleanupInvitations(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Delete expired invitations that were never accepted
    const result = await db
      .delete(invitationsTable)
      .where(
        and(
          lt(invitationsTable.expiresAt, thirtyDaysAgo),
          isNull(invitationsTable.acceptedAt)
        )
      );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info(
        { deletedCount, expiredBefore: thirtyDaysAgo },
        'Cleaned up expired invitations'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup invitations');
    throw error;
  }
}

import { db } from '../db';
import { accountsTable } from '../schema';
import { sql } from 'drizzle-orm';
import { logger } from '../logger';
import { refreshOAuthToken } from '../oauth-token-manager';

/**
 * Proactively refresh OAuth tokens that are expiring soon
 *
 * This job prevents the 200-500ms latency spike during workflow execution
 * by refreshing tokens before they're needed.
 *
 * Runs every 15 minutes and refreshes tokens expiring in the next hour.
 * Processes in batches of 100 to prevent memory issues and timeouts.
 */
export async function refreshExpiringTokens(): Promise<void> {
  try {
    logger.info('Starting proactive OAuth token refresh');

    // Find accounts with tokens expiring in the next hour
    const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600;
    const BATCH_SIZE = 100; // Process max 100 tokens per run

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;

    const expiringAccounts = await dbAny
      .select()
      .from(accountsTable)
      .where(
        sql`${accountsTable.expires_at} IS NOT NULL AND ${accountsTable.expires_at} < ${oneHourFromNow} AND ${accountsTable.expires_at} > ${Math.floor(Date.now() / 1000)}`
      )
      .limit(BATCH_SIZE);

    if (expiringAccounts.length === 0) {
      logger.debug('No tokens expiring in the next hour');
      return;
    }

    logger.info(
      { tokenCount: expiringAccounts.length },
      `Found ${expiringAccounts.length} tokens expiring in the next hour${expiringAccounts.length === BATCH_SIZE ? ' (limited to batch size)' : ''}`
    );

    // Refresh each token (sequentially to avoid overwhelming OAuth providers)
    let successCount = 0;
    let failCount = 0;

    for (const account of expiringAccounts) {
      try {
        await refreshOAuthToken(account.userId, account.provider, account.providerAccountId);
        successCount++;

        logger.debug(
          {
            userId: account.userId,
            provider: account.provider,
            expiresAt: account.expires_at,
          },
          `Proactively refreshed token for ${account.provider}`
        );
      } catch (error) {
        failCount++;
        logger.warn(
          {
            userId: account.userId,
            provider: account.provider,
            error: error instanceof Error ? error.message : String(error),
          },
          `Failed to proactively refresh token for ${account.provider}`
        );
      }

      // Small delay between requests to be nice to OAuth providers
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info(
      {
        total: expiringAccounts.length,
        success: successCount,
        failed: failCount,
      },
      `Proactive token refresh completed: ${successCount} successful, ${failCount} failed`
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in proactive token refresh job'
    );
  }
}

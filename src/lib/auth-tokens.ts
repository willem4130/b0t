import { db } from './db';
import { accountsTable } from './schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from './encryption';
import { logger } from './logger';

/**
 * OAuth Token Retrieval Utility
 *
 * Retrieves and decrypts OAuth tokens from the accounts table.
 * All tokens are encrypted at rest for security.
 */

export interface OAuthTokens {
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
}

/**
 * Get OAuth tokens for a specific provider and user
 *
 * @param provider - OAuth provider (e.g., 'twitter', 'youtube')
 * @param userId - User ID (defaults to '1' for single-user app)
 * @returns Decrypted OAuth tokens or null if not found
 */
export async function getOAuthTokens(
  provider: string,
  userId: string = '1'
): Promise<OAuthTokens | null> {
  try {
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.userId, userId),
          eq(accountsTable.provider, provider)
        )
      )
      .limit(1);

    if (!account) {
      logger.warn({ provider, userId }, 'OAuth account not found');
      return null;
    }

    // Decrypt tokens (only if they exist)
    const access_token = account.access_token ? await decrypt(account.access_token) : null;
    const refresh_token = account.refresh_token ? await decrypt(account.refresh_token) : null;
    const id_token = account.id_token ? await decrypt(account.id_token) : null;

    return {
      access_token,
      refresh_token,
      id_token,
      expires_at: account.expires_at,
      token_type: account.token_type,
      scope: account.scope,
    };
  } catch (error) {
    logger.error({ error, provider, userId }, 'Failed to retrieve OAuth tokens');
    throw error;
  }
}

/**
 * Check if OAuth account is connected for a provider
 *
 * @param provider - OAuth provider (e.g., 'twitter', 'youtube')
 * @param userId - User ID (defaults to '1' for single-user app)
 * @returns true if account is connected
 */
export async function isOAuthConnected(
  provider: string,
  userId: string = '1'
): Promise<boolean> {
  try {
    const [account] = await db
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.userId, userId),
          eq(accountsTable.provider, provider)
        )
      )
      .limit(1);

    return !!account;
  } catch (error) {
    logger.error({ error, provider, userId }, 'Failed to check OAuth connection');
    return false;
  }
}

/**
 * Get Twitter OAuth 2.0 access token
 *
 * @param userId - User ID (defaults to '1' for single-user app)
 * @returns Twitter access token or null
 */
export async function getTwitterAccessToken(userId: string = '1'): Promise<string | null> {
  const tokens = await getOAuthTokens('twitter', userId);
  return tokens?.access_token || null;
}

/**
 * Get Twitter OAuth 2.0 refresh token
 *
 * @param userId - User ID (defaults to '1' for single-user app)
 * @returns Twitter refresh token or null
 */
export async function getTwitterRefreshToken(userId: string = '1'): Promise<string | null> {
  const tokens = await getOAuthTokens('twitter', userId);
  return tokens?.refresh_token || null;
}

/**
 * Example usage:
 *
 * // In a route or job that needs Twitter API access:
 * import { getTwitterAccessToken } from '@/lib/auth-tokens';
 *
 * const accessToken = await getTwitterAccessToken();
 * if (!accessToken) {
 *   throw new Error('Twitter not connected');
 * }
 *
 * // Use token with Twitter API
 * const client = new TwitterApi(accessToken);
 */

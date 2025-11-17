import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { accountsTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Twitter Connection Status Endpoint
 *
 * Returns whether the current user has connected their Twitter account
 * and provides basic account information.
 */
export async function GET() {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Look up Twitter account in database
    const [twitterAccount] = await db
      .select()
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.userId, session.user.id),
          eq(accountsTable.provider, 'twitter')
        )
      )
      .limit(1);

    if (!twitterAccount) {
      return NextResponse.json({
        connected: false,
        account: null,
      });
    }

    // Check if token is expired (tokens expire in 2 hours by default)
    const isExpired = twitterAccount.expires_at
      ? twitterAccount.expires_at < Math.floor(Date.now() / 1000)
      : false;

    logger.info(
      { userId: session.user.id, isExpired },
      'Checked Twitter connection status'
    );

    return NextResponse.json({
      connected: true,
      account: {
        providerAccountId: twitterAccount.providerAccountId,
        accountName: twitterAccount.account_name,
        hasRefreshToken: !!twitterAccount.refresh_token,
        isExpired,
        expiresAt: twitterAccount.expires_at,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to check Twitter connection status');
    return NextResponse.json(
      { error: 'Failed to check connection status' },
      { status: 500 }
    );
  }
}

/**
 * Disconnect Twitter Account
 *
 * Removes the Twitter account connection for the current user.
 */
export async function DELETE() {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Delete Twitter account from database
    await db
      .delete(accountsTable)
      .where(
        and(
          eq(accountsTable.userId, session.user.id),
          eq(accountsTable.provider, 'twitter')
        )
      );

    logger.info({ userId: session.user.id }, 'Disconnected Twitter account');

    return NextResponse.json({
      success: true,
      message: 'Twitter account disconnected',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to disconnect Twitter account');
    return NextResponse.json(
      { error: 'Failed to disconnect account' },
      { status: 500 }
    );
  }
}

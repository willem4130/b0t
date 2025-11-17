import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { accountsTable } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { eq, and } from 'drizzle-orm';

/**
 * YouTube Connection Status Endpoint
 *
 * GET: Check if YouTube is connected
 * DELETE: Disconnect YouTube account
 */

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Look up YouTube account in accounts table
    const [youtubeAccount] = await db
      .select()
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.userId, session.user.id),
          eq(accountsTable.provider, 'youtube')
        )
      )
      .limit(1);

    if (!youtubeAccount) {
      return NextResponse.json({
        connected: false,
      });
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    const isExpired = youtubeAccount.expires_at ? youtubeAccount.expires_at < now : false;

    return NextResponse.json({
      connected: true,
      account: {
        providerAccountId: youtubeAccount.providerAccountId,
        accountName: youtubeAccount.account_name,
        hasRefreshToken: !!youtubeAccount.refresh_token,
        isExpired,
        expiresAt: youtubeAccount.expires_at,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error checking YouTube connection status');
    return NextResponse.json(
      { error: 'Failed to check YouTube connection status' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Delete YouTube account from database
    await db
      .delete(accountsTable)
      .where(
        and(
          eq(accountsTable.userId, session.user.id),
          eq(accountsTable.provider, 'youtube')
        )
      );

    logger.info({ userId: session.user.id }, 'YouTube account disconnected');

    return NextResponse.json({
      success: true,
      message: 'YouTube account disconnected successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Error disconnecting YouTube account');
    return NextResponse.json(
      { error: 'Failed to disconnect YouTube account' },
      { status: 500 }
    );
  }
}

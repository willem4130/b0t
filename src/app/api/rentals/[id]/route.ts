import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  rentalListingsTable,
  rentalFavoritesTable,
  rentalRankingsTable,
  rentalCommentsTable
} from '@/lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rentals/[id]
 * Get a single rental listing with all details, comments, and user interactions
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const listingId = parseInt(id, 10);

    if (isNaN(listingId)) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    // Fetch the listing
    const listings = await db
      .select()
      .from(rentalListingsTable)
      .where(
        and(
          eq(rentalListingsTable.id, listingId),
          eq(rentalListingsTable.userId, session.user.id)
        )
      )
      .limit(1);

    if (listings.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const listing = listings[0];

    // Check if user has favorited this listing
    const favorites = await db
      .select()
      .from(rentalFavoritesTable)
      .where(
        and(
          eq(rentalFavoritesTable.listingId, listingId),
          eq(rentalFavoritesTable.userId, session.user.id)
        )
      )
      .limit(1);

    const isFavorited = favorites.length > 0;

    // Get user's ranking for this listing
    const rankings = await db
      .select()
      .from(rentalRankingsTable)
      .where(
        and(
          eq(rentalRankingsTable.listingId, listingId),
          eq(rentalRankingsTable.userId, session.user.id)
        )
      )
      .limit(1);

    const userRanking = rankings.length > 0 ? rankings[0] : null;

    // Get all comments for this listing (only from the current user)
    const comments = await db
      .select()
      .from(rentalCommentsTable)
      .where(
        and(
          eq(rentalCommentsTable.listingId, listingId),
          eq(rentalCommentsTable.userId, session.user.id)
        )
      )
      .orderBy(desc(rentalCommentsTable.createdAt));

    return NextResponse.json({
      listing: {
        ...listing,
        isFavorited,
        userRating: userRanking?.rating || null,
        userRatingNotes: userRanking?.notes || null,
      },
      comments,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_get_failed',
        listingId: id
      },
      'Failed to get rental listing'
    );
    return NextResponse.json(
      { error: 'Failed to get rental listing' },
      { status: 500 }
    );
  }
}

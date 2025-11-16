import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { rentalRankingsTable, rentalListingsTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rentals/[id]/ranking
 * Get user's ranking for a rental listing
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

    if (rankings.length === 0) {
      return NextResponse.json({ ranking: null });
    }

    return NextResponse.json({ ranking: rankings[0] });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_ranking_get_failed',
        listingId: id
      },
      'Failed to get ranking'
    );
    return NextResponse.json(
      { error: 'Failed to get ranking' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rentals/[id]/ranking
 * Add or update user's ranking for a rental listing
 */
export async function POST(
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

    const body = await request.json();
    const { rating, notes } = body;

    // Validate rating
    if (rating === undefined || rating === null) {
      return NextResponse.json({ error: 'Rating is required' }, { status: 400 });
    }

    const ratingNum = parseInt(rating, 10);

    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    // Validate notes (optional)
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string') {
        return NextResponse.json({ error: 'Notes must be a string' }, { status: 400 });
      }
      if (notes.length > 2000) {
        return NextResponse.json({ error: 'Notes are too long (max 2000 characters)' }, { status: 400 });
      }
    }

    // Verify the listing exists and belongs to the user
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

    // Check if ranking already exists
    const existing = await db
      .select()
      .from(rentalRankingsTable)
      .where(
        and(
          eq(rentalRankingsTable.listingId, listingId),
          eq(rentalRankingsTable.userId, session.user.id)
        )
      )
      .limit(1);

    let result;

    if (existing.length > 0) {
      // Update existing ranking
      result = await db
        .update(rentalRankingsTable)
        .set({
          rating: ratingNum,
          notes: notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rentalRankingsTable.listingId, listingId),
            eq(rentalRankingsTable.userId, session.user.id)
          )
        )
        .returning();

      return NextResponse.json({
        message: 'Ranking updated',
        ranking: result[0]
      });
    } else {
      // Insert new ranking
      result = await db.insert(rentalRankingsTable).values({
        listingId,
        userId: session.user.id,
        organizationId: listing.organizationId,
        rating: ratingNum,
        notes: notes?.trim() || null,
      }).returning();

      return NextResponse.json({
        message: 'Ranking added',
        ranking: result[0]
      });
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_ranking_add_failed',
        listingId: id
      },
      'Failed to add/update ranking'
    );
    return NextResponse.json(
      { error: 'Failed to add/update ranking' },
      { status: 500 }
    );
  }
}

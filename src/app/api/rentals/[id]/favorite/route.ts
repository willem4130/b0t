import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { rentalFavoritesTable, rentalListingsTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rentals/[id]/favorite
 * Add a rental listing to favorites
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

    // Check if already favorited
    const existing = await db
      .select()
      .from(rentalFavoritesTable)
      .where(
        and(
          eq(rentalFavoritesTable.listingId, listingId),
          eq(rentalFavoritesTable.userId, session.user.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        message: 'Already favorited',
        isFavorited: true
      });
    }

    // Add to favorites
    await db.insert(rentalFavoritesTable).values({
      listingId,
      userId: session.user.id,
      organizationId: listing.organizationId,
    });

    return NextResponse.json({
      message: 'Added to favorites',
      isFavorited: true
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_favorite_add_failed',
        listingId: id
      },
      'Failed to add rental to favorites'
    );
    return NextResponse.json(
      { error: 'Failed to add to favorites' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rentals/[id]/favorite
 * Remove a rental listing from favorites
 */
export async function DELETE(
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

    // Delete from favorites
    await db
      .delete(rentalFavoritesTable)
      .where(
        and(
          eq(rentalFavoritesTable.listingId, listingId),
          eq(rentalFavoritesTable.userId, session.user.id)
        )
      );

    return NextResponse.json({
      message: 'Removed from favorites',
      isFavorited: false
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_favorite_remove_failed',
        listingId: id
      },
      'Failed to remove rental from favorites'
    );
    return NextResponse.json(
      { error: 'Failed to remove from favorites' },
      { status: 500 }
    );
  }
}

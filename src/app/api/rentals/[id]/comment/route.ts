import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { rentalCommentsTable, rentalListingsTable } from '@/lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rentals/[id]/comment
 * Get all comments for a rental listing
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

    return NextResponse.json({ comments });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_comments_get_failed',
        listingId: id
      },
      'Failed to get comments'
    );
    return NextResponse.json(
      { error: 'Failed to get comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rentals/[id]/comment
 * Add a comment to a rental listing
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
    const { comment } = body;

    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return NextResponse.json({ error: 'Comment is required' }, { status: 400 });
    }

    if (comment.length > 5000) {
      return NextResponse.json({ error: 'Comment is too long (max 5000 characters)' }, { status: 400 });
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

    // Insert comment
    const result = await db.insert(rentalCommentsTable).values({
      listingId,
      userId: session.user.id,
      organizationId: listing.organizationId,
      comment: comment.trim(),
    }).returning();

    return NextResponse.json({
      message: 'Comment added',
      comment: result[0]
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_comment_add_failed',
        listingId: id
      },
      'Failed to add comment'
    );
    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rentals/[id]/comment
 * Delete a comment (requires commentId in query params)
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

    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json({ error: 'Comment ID is required' }, { status: 400 });
    }

    const commentIdNum = parseInt(commentId, 10);

    if (isNaN(commentIdNum)) {
      return NextResponse.json({ error: 'Invalid comment ID' }, { status: 400 });
    }

    // Delete comment (ensure it belongs to the user)
    await db
      .delete(rentalCommentsTable)
      .where(
        and(
          eq(rentalCommentsTable.id, commentIdNum),
          eq(rentalCommentsTable.userId, session.user.id)
        )
      );

    return NextResponse.json({ message: 'Comment deleted' });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rental_comment_delete_failed',
        listingId: id
      },
      'Failed to delete comment'
    );
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}

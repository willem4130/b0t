import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  rentalListingsTable,
  rentalFavoritesTable,
  rentalRankingsTable
} from '@/lib/schema';
import { eq, and, isNull, sql, gte, lte, or, ilike, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rentals
 * List all rental listings for the authenticated user
 * Query params:
 *   - organizationId: Filter by organization/client
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50, max: 100)
 *   - favoritesOnly: Show only favorited listings (boolean)
 *   - minPrice: Minimum price filter
 *   - maxPrice: Maximum price filter
 *   - bedrooms: Number of bedrooms
 *   - minRating: Minimum rating (1-5)
 *   - search: Search in title, description, location
 *   - siteName: Filter by source website
 */
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    // Filter parameters
    const favoritesOnly = searchParams.get('favoritesOnly') === 'true';
    const minPrice = searchParams.get('minPrice') ? parseInt(searchParams.get('minPrice')!, 10) : null;
    const maxPrice = searchParams.get('maxPrice') ? parseInt(searchParams.get('maxPrice')!, 10) : null;
    const bedrooms = searchParams.get('bedrooms') ? parseInt(searchParams.get('bedrooms')!, 10) : null;
    const minRating = searchParams.get('minRating') ? parseInt(searchParams.get('minRating')!, 10) : null;
    const search = searchParams.get('search');
    const siteName = searchParams.get('siteName');

    // Build where clause for rental listings
    const whereConditions = [eq(rentalListingsTable.userId, session.user.id)];

    if (organizationId) {
      whereConditions.push(eq(rentalListingsTable.organizationId, organizationId));
    } else {
      whereConditions.push(isNull(rentalListingsTable.organizationId));
    }

    // Price filters
    if (minPrice !== null) {
      whereConditions.push(gte(rentalListingsTable.priceNumeric, minPrice));
    }
    if (maxPrice !== null) {
      whereConditions.push(lte(rentalListingsTable.priceNumeric, maxPrice));
    }

    // Bedrooms filter
    if (bedrooms !== null) {
      whereConditions.push(eq(rentalListingsTable.bedrooms, bedrooms));
    }

    // Site name filter
    if (siteName) {
      whereConditions.push(eq(rentalListingsTable.siteName, siteName));
    }

    // Search filter (title, description, location)
    if (search) {
      whereConditions.push(
        or(
          ilike(rentalListingsTable.title, `%${search}%`),
          ilike(rentalListingsTable.description, `%${search}%`),
          ilike(rentalListingsTable.location, `%${search}%`)
        )!
      );
    }

    // Fetch rental listings with favorites and ratings
    const rawListings = await db
      .select({
        id: rentalListingsTable.id,
        userId: rentalListingsTable.userId,
        organizationId: rentalListingsTable.organizationId,
        workflowId: rentalListingsTable.workflowId,
        siteName: rentalListingsTable.siteName,
        siteUrl: rentalListingsTable.siteUrl,
        listingUrl: rentalListingsTable.listingUrl,
        title: rentalListingsTable.title,
        description: rentalListingsTable.description,
        price: rentalListingsTable.price,
        priceNumeric: rentalListingsTable.priceNumeric,
        bedrooms: rentalListingsTable.bedrooms,
        bathrooms: rentalListingsTable.bathrooms,
        hasPool: rentalListingsTable.hasPool,
        hasGarden: rentalListingsTable.hasGarden,
        propertyType: rentalListingsTable.propertyType,
        contactEmail: rentalListingsTable.contactEmail,
        contactPhone: rentalListingsTable.contactPhone,
        location: rentalListingsTable.location,
        images: rentalListingsTable.images,
        amenities: rentalListingsTable.amenities,
        isMatch: rentalListingsTable.isMatch,
        matchScore: rentalListingsTable.matchScore,
        scrapedAt: rentalListingsTable.scrapedAt,
        createdAt: rentalListingsTable.createdAt,
        updatedAt: rentalListingsTable.updatedAt,
        isFavorited: sql<number>`CASE WHEN ${rentalFavoritesTable.id} IS NOT NULL THEN 1 ELSE 0 END`.as('is_favorited'),
        userRating: rentalRankingsTable.rating,
        userRatingNotes: rentalRankingsTable.notes,
      })
      .from(rentalListingsTable)
      .leftJoin(
        rentalFavoritesTable,
        and(
          eq(rentalFavoritesTable.listingId, rentalListingsTable.id),
          eq(rentalFavoritesTable.userId, session.user.id)
        )
      )
      .leftJoin(
        rentalRankingsTable,
        and(
          eq(rentalRankingsTable.listingId, rentalListingsTable.id),
          eq(rentalRankingsTable.userId, session.user.id)
        )
      )
      .where(and(...whereConditions))
      .orderBy(desc(rentalListingsTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply post-query filters and normalize data
    let listings = rawListings.map(listing => ({
      ...listing,
      // Ensure images and amenities are always arrays
      // Handle both JSON arrays and PostgreSQL arrays (returned as already parsed)
      images: Array.isArray(listing.images)
        ? listing.images
        : [],
      amenities: Array.isArray(listing.amenities)
        ? listing.amenities
        : [],
    }));

    // Filter by favorites only
    if (favoritesOnly) {
      listings = listings.filter(listing => listing.isFavorited === 1);
    }

    // Filter by minimum rating
    if (minRating !== null) {
      listings = listings.filter(listing => listing.userRating && listing.userRating >= minRating);
    }

    // Get total count for pagination metadata
    const totalCountResult = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${rentalListingsTable.id})` })
      .from(rentalListingsTable)
      .where(and(...whereConditions));

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Get stats
    const statsResult = await db
      .select({
        totalListings: sql<number>`COUNT(DISTINCT ${rentalListingsTable.id})`,
        totalFavorites: sql<number>`COUNT(DISTINCT ${rentalFavoritesTable.id})`,
        avgRating: sql<number>`AVG(${rentalRankingsTable.rating})`,
      })
      .from(rentalListingsTable)
      .leftJoin(
        rentalFavoritesTable,
        and(
          eq(rentalFavoritesTable.userId, session.user.id),
          eq(rentalFavoritesTable.listingId, rentalListingsTable.id)
        )
      )
      .leftJoin(
        rentalRankingsTable,
        and(
          eq(rentalRankingsTable.userId, session.user.id),
          eq(rentalRankingsTable.listingId, rentalListingsTable.id)
        )
      )
      .where(and(...whereConditions.slice(0, 2))); // Only user and org filters

    const stats = {
      totalListings: statsResult[0]?.totalListings || 0,
      totalFavorites: statsResult[0]?.totalFavorites || 0,
      avgRating: statsResult[0]?.avgRating ? Math.round(statsResult[0].avgRating * 10) / 10 : 0,
    };

    return NextResponse.json({
      listings,
      stats,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'rentals_list_failed'
      },
      'Failed to list rental listings'
    );
    return NextResponse.json(
      { error: 'Failed to list rental listings' },
      { status: 500 }
    );
  }
}

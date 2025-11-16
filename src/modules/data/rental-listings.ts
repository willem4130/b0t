import { db } from '@/lib/db';
import { rentalListingsTable } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { eq, and } from 'drizzle-orm';

interface RentalListing {
  site_name?: string;
  title: string;
  price?: number | string;
  bedrooms?: number;
  bathrooms?: number;
  url?: string;
  image_url?: string;
  description?: string;
  location?: string;
  property_type?: string;
  has_pool?: boolean;
  has_garden?: boolean;
  amenities?: string[];
  scraped_at?: string;
}

/**
 * Save rental listings to database
 *
 * Automatically handles deduplication based on listing URL.
 * Skips listings that already exist for the same user.
 *
 * @param listings - Array of rental listing objects
 * @param userId - User ID who owns these listings
 * @param organizationId - Optional organization ID
 * @returns Summary of save operation (inserted, skipped, errors)
 */
export async function saveRentalListings(
  listings: RentalListing[],
  userId: string,
  organizationId: string | null = null
) {
  if (!Array.isArray(listings) || listings.length === 0) {
    logger.warn('No listings provided to save');
    return {
      success: true,
      inserted: 0,
      skipped: 0,
      errors: 0,
      total: 0,
    };
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const listing of listings) {
    try {
      // Skip if no title or URL
      if (!listing.title || !listing.url) {
        logger.warn({ listing }, 'Skipping listing - missing title or URL');
        skipped++;
        continue;
      }

      // Check if listing already exists by URL
      const whereConditions = [
        eq(rentalListingsTable.listingUrl, listing.url),
        eq(rentalListingsTable.userId, userId),
      ];

      if (organizationId) {
        whereConditions.push(eq(rentalListingsTable.organizationId, organizationId));
      }

      const existing = await db
        .select()
        .from(rentalListingsTable)
        .where(and(...whereConditions))
        .limit(1);

      if (existing.length > 0) {
        logger.info({ listingUrl: listing.url }, 'Listing already exists, skipping');
        skipped++;
        continue;
      }

      // Parse price if it's a string
      let priceNumeric = 0;
      if (typeof listing.price === 'number') {
        priceNumeric = listing.price;
      } else if (typeof listing.price === 'string') {
        const match = listing.price.replace(/,/g, '').match(/(\d+)/);
        priceNumeric = match ? parseInt(match[1]) : 0;
      }

      // Insert new listing
      await db.insert(rentalListingsTable).values({
        userId,
        organizationId,
        siteName: listing.site_name || 'Unknown',
        siteUrl: listing.url?.split('/').slice(0, 3).join('/') || '',
        listingUrl: listing.url,
        title: listing.title,
        description: listing.description || '',
        price: typeof listing.price === 'string' ? listing.price : `$${listing.price || 0}`,
        priceNumeric,
        bedrooms: listing.bedrooms || 0,
        bathrooms: listing.bathrooms || 0,
        hasPool: listing.has_pool ? 1 : 0,
        hasGarden: listing.has_garden ? 1 : 0,
        propertyType: listing.property_type || '',
        location: listing.location || '',
        images: listing.image_url ? [listing.image_url] : [],
        amenities: listing.amenities || [],
        scrapedAt: listing.scraped_at ? new Date(listing.scraped_at) : new Date(),
      });

      inserted++;
      logger.info({ listingUrl: listing.url, title: listing.title }, 'Saved rental listing');
    } catch (error) {
      logger.error({ error, listing }, 'Failed to save rental listing');
      errors++;
    }
  }

  const result = {
    success: true,
    inserted,
    skipped,
    errors,
    total: listings.length,
  };

  logger.info(result, 'Rental listings save complete');
  return result;
}

import { db } from '../src/lib/db';
import { rentalListingsTable, rentalFavoritesTable, rentalRankingsTable } from '../src/lib/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

async function test() {
const userId = '1'; // admin user ID
const organizationId = null;

console.log('Testing rentals API query...\n');
console.log('Filters:');
console.log(`  userId: "${userId}"`);
console.log(`  organizationId: ${organizationId}`);
console.log('');

// Build where clause exactly like the API does
const whereConditions = [eq(rentalListingsTable.userId, userId)];

if (organizationId) {
  whereConditions.push(eq(rentalListingsTable.organizationId, organizationId));
} else {
  whereConditions.push(isNull(rentalListingsTable.organizationId));
}

// Execute the exact query the API uses
const rawListings = await db
  .select({
    id: rentalListingsTable.id,
    userId: rentalListingsTable.userId,
    organizationId: rentalListingsTable.organizationId,
    siteName: rentalListingsTable.siteName,
    title: rentalListingsTable.title,
    price: rentalListingsTable.price,
    priceNumeric: rentalListingsTable.priceNumeric,
    bedrooms: rentalListingsTable.bedrooms,
    location: rentalListingsTable.location,
    createdAt: rentalListingsTable.createdAt,
  })
  .from(rentalListingsTable)
  .leftJoin(
    rentalFavoritesTable,
    and(
      eq(rentalFavoritesTable.listingId, rentalListingsTable.id),
      eq(rentalFavoritesTable.userId, userId)
    )
  )
  .leftJoin(
    rentalRankingsTable,
    and(
      eq(rentalRankingsTable.listingId, rentalListingsTable.id),
      eq(rentalRankingsTable.userId, userId)
    )
  )
  .where(and(...whereConditions))
  .orderBy(desc(rentalListingsTable.createdAt))
  .limit(50);

console.log(`Query returned: ${rawListings.length} listings\n`);

if (rawListings.length > 0) {
  console.log('Sample listings:');
  rawListings.slice(0, 3).forEach((listing, i) => {
    console.log(`${i + 1}. ${listing.title} - ${listing.price} (user_id: ${listing.userId}, org_id: ${listing.organizationId})`);
  });
} else {
  console.log('❌ NO LISTINGS RETURNED!');
  console.log('\nLet me check what listings exist...');

  const allListings = await db
    .select({
      id: rentalListingsTable.id,
      userId: rentalListingsTable.userId,
      organizationId: rentalListingsTable.organizationId,
      title: rentalListingsTable.title,
    })
    .from(rentalListingsTable)
    .limit(10);

  console.log(`\nTotal listings in DB: ${allListings.length}`);
  allListings.forEach((listing, i) => {
    console.log(`${i + 1}. user_id="${listing.userId}", org_id="${listing.organizationId}", title="${listing.title}"`);
  });
}
}

test().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

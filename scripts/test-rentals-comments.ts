import { db } from '../src/lib/db';
import { rentalCommentsTable, rentalListingsTable } from '../src/lib/schema';
import { eq, and } from 'drizzle-orm';

async function test() {
  const userId = '1'; // admin user ID

  console.log('Testing rentals comments API...\n');

  // Get a listing ID
  const listings = await db
    .select({ id: rentalListingsTable.id, title: rentalListingsTable.title })
    .from(rentalListingsTable)
    .where(eq(rentalListingsTable.userId, userId))
    .limit(1);

  if (listings.length === 0) {
    console.log('No listings found for user');
    return;
  }

  const listingId = listings[0].id;
  console.log(`Testing with listing: ${listings[0].title} (ID: ${listingId})\n`);

  // Get comments for this listing
  const comments = await db
    .select()
    .from(rentalCommentsTable)
    .where(
      and(
        eq(rentalCommentsTable.listingId, listingId),
        eq(rentalCommentsTable.userId, userId)
      )
    );

  console.log(`Found ${comments.length} comments`);

  if (comments.length > 0) {
    console.log('\nSample comment:');
    console.log(JSON.stringify(comments[0], null, 2));
  }

  // Simulate API response
  console.log('\nAPI would return:');
  console.log(JSON.stringify({ comments }, null, 2));
  console.log('\nNote: No "success" field in response!');
}

test().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

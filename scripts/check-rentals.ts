import { db } from '../src/lib/db';
import { rentalListingsTable } from '../src/lib/schema';
import { sql } from 'drizzle-orm';

async function checkRentals() {
  try {
    // Count total rentals
    const result = await db.select({ count: sql<number>`count(*)` }).from(rentalListingsTable);
    console.log('Total rental listings:', result[0]?.count || 0);

    // Get a sample listing if any exist
    const sample = await db.select().from(rentalListingsTable).limit(1);
    if (sample.length > 0) {
      console.log('\nSample listing:');
      console.log(JSON.stringify(sample[0], null, 2));
    } else {
      console.log('\nNo listings found in database.');
      console.log('Run the Aruba scraper workflow to populate data.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error checking rentals:', error);
    process.exit(1);
  }
}

checkRentals();

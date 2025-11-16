import { saveRentalListings } from '../src/modules/data/rental-listings';

// Test data matching the format from your workflow output
const testListings = [
  {
    site_name: 'Aruba Listings',
    title: 'Test Casibari 59',
    price: 2750,
    bedrooms: 4,
    url: 'https://arubalistings.com/rent/paradera/residential-14038-casibari-59',
    image_url: 'https://arubalistings.com/storage/app/uploads/public/691/3ed/40c/thumb_403135_720_460_0_0_crop.jpg',
    description: 'Beautiful property in Paradera',
    location: 'Paradera',
    property_type: 'Residential',
    has_pool: false,
    has_garden: true,
    amenities: ['WiFi', 'AC', 'Parking'],
    scraped_at: new Date().toISOString(),
  },
  {
    site_name: 'Aruba Listings',
    title: 'Test Gold Coast 2 Bedroom',
    price: 2500,
    bedrooms: 2,
    url: 'https://arubalistings.com/rent/noord/residential-14034-gold-coast-2-bedroom',
    image_url: 'https://arubalistings.com/storage/app/uploads/public/691/29c/208/thumb_403029_720_460_0_0_crop.jpg',
    description: 'Cozy apartment in Noord',
    location: 'Noord',
    property_type: 'Apartment',
    has_pool: true,
    has_garden: false,
    amenities: ['WiFi', 'AC'],
    scraped_at: new Date().toISOString(),
  },
];

async function test() {
  console.log('Testing saveRentalListings with sample data...\n');

  const result = await saveRentalListings(testListings, '1', null);

  console.log('Result:', result);
  console.log('\nCheck the dashboard at http://localhost:3000/dashboard/rentals');

  process.exit(0);
}

test().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

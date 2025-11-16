# Aruba Rental Listings - Workflow Integration Guide

## Overview

You now have a complete rental listings system with:
- ✅ Database module to save scraped data
- ✅ REST API for listings, favorites, comments, ratings
- ✅ Beautiful dashboard at `/dashboard/rentals`
- ✅ "Dashboard" button on workflow card

## How to Integrate with Your Scraper Workflow

### Current State

Your workflow scrapes rental listings and displays them in the output, but doesn't save them to the database.

### Solution

Add a final step to your workflow that saves the scraped data using the `data.saveRentalListings` module.

### Step-by-Step Integration

1. **Edit Your Workflow** (via Settings or by exporting/importing):

   Add this step at the end of your workflow (after scraping):

   ```json
   {
     "id": "save-to-database",
     "type": "action",
     "name": "Save Listings to Database",
     "module": "data.saveRentalListings",
     "inputs": {
       "listings": "{{scrape_output}}"
     }
   }
   ```

2. **Replace `{{scrape_output}}`** with whatever variable contains your scraped listings array.

### Data Format

The module expects listings in this format:

```javascript
[
  {
    site_name: "Aruba Listings",          // Source website
    title: "Beautiful Beach House",       // Required
    url: "https://...",                    // Required (for deduplication)
    price: 2500,                          // Can be number or string
    bedrooms: 3,
    bathrooms: 2,
    location: "Palm Beach",
    property_type: "House",
    description: "Amazing ocean views...",
    image_url: "https://...",
    has_pool: true,
    has_garden: false,
    amenities: ["WiFi", "AC", "Parking"],
    scraped_at: "2025-11-16T12:00:00Z"
  }
]
```

### Module Features

- ✅ **Automatic Deduplication**: Won't insert duplicates (checks by URL)
- ✅ **Error Handling**: Continues on errors, reports summary
- ✅ **Price Parsing**: Handles both numeric and string prices
- ✅ **Multi-tenant**: Respects user/organization isolation
- ✅ **Logging**: Full audit trail of saves

### Return Value

The module returns:

```javascript
{
  success: true,
  inserted: 45,     // New listings added
  skipped: 12,      // Duplicates skipped
  errors: 0,        // Errors encountered
  total: 57         // Total processed
}
```

### Testing

I've added 2 test listings to your database. Check them at:
http://localhost:3000/dashboard/rentals

### Quick Test

Run this to add more test data:

```bash
npx tsx scripts/test-save-rentals.ts
```

### Next Steps

1. **Add the save step to your workflow**
2. **Run the workflow**
3. **Visit the dashboard** to see your listings
4. **Add favorites, ratings, and comments**

## Available Modules

- `data.saveRentalListings` - Save scraped listings to database

## Dashboard Features

- 📊 Stats cards (total listings, favorites, avg rating)
- 🔍 Search and filter (price, bedrooms, location)
- ❤️ Favorite listings
- ⭐ Rate properties (1-5 stars)
- 💬 Add personal notes/comments
- 🖼️ Image carousel for each listing
- 📱 Responsive design

## Database Schema

Table: `rental_listings`
- Deduplication by `listing_url` + `user_id`
- Indexes on common filters (price, bedrooms, location)
- PostgreSQL arrays for images and amenities
- Full-text search ready

## API Endpoints

All available at `/api/rentals`:
- `GET /api/rentals` - List with filters
- `GET /api/rentals/[id]` - Single listing
- `POST/DELETE /api/rentals/[id]/favorite` - Toggle favorite
- `GET/POST/DELETE /api/rentals/[id]/comment` - Manage comments
- `GET/POST /api/rentals/[id]/ranking` - Manage ratings

Enjoy your new rental listings system!

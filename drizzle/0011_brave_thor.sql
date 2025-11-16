CREATE TABLE "rental_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"organization_id" varchar(255),
	"workflow_id" varchar(255),
	"site_name" varchar(255) NOT NULL,
	"site_url" text NOT NULL,
	"listing_url" text,
	"title" text,
	"description" text,
	"price" varchar(100),
	"price_numeric" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"has_pool" integer DEFAULT 0,
	"has_garden" integer DEFAULT 0,
	"property_type" varchar(100),
	"contact_email" varchar(255),
	"contact_phone" varchar(100),
	"location" varchar(255),
	"images" text,
	"amenities" text,
	"is_match" integer DEFAULT 0,
	"match_score" integer DEFAULT 0,
	"raw_html" text,
	"metadata" jsonb,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rental_listings_user_id_idx" ON "rental_listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rental_listings_organization_id_idx" ON "rental_listings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rental_listings_workflow_id_idx" ON "rental_listings" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "rental_listings_site_name_idx" ON "rental_listings" USING btree ("site_name");--> statement-breakpoint
CREATE INDEX "rental_listings_is_match_idx" ON "rental_listings" USING btree ("is_match");--> statement-breakpoint
CREATE INDEX "rental_listings_price_idx" ON "rental_listings" USING btree ("price_numeric");--> statement-breakpoint
CREATE INDEX "rental_listings_bedrooms_idx" ON "rental_listings" USING btree ("bedrooms");--> statement-breakpoint
CREATE INDEX "rental_listings_scraped_at_idx" ON "rental_listings" USING btree ("scraped_at");--> statement-breakpoint
CREATE INDEX "rental_listings_created_at_idx" ON "rental_listings" USING btree ("created_at");
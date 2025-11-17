CREATE TABLE "rental_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"organization_id" varchar(255),
	"listing_id" integer NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"organization_id" varchar(255),
	"listing_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"organization_id" varchar(255),
	"listing_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_comments" ADD CONSTRAINT "rental_comments_listing_id_rental_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."rental_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_favorites" ADD CONSTRAINT "rental_favorites_listing_id_rental_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."rental_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_rankings" ADD CONSTRAINT "rental_rankings_listing_id_rental_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."rental_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_comments_user_id_idx" ON "rental_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rental_comments_listing_id_idx" ON "rental_comments" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "rental_comments_created_at_idx" ON "rental_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rental_favorites_user_id_idx" ON "rental_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rental_favorites_listing_id_idx" ON "rental_favorites" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_favorites_user_listing_idx" ON "rental_favorites" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "rental_rankings_user_id_idx" ON "rental_rankings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rental_rankings_listing_id_idx" ON "rental_rankings" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_rankings_user_listing_idx" ON "rental_rankings" USING btree ("user_id","listing_id");
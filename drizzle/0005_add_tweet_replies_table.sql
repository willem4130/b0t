-- Create tweet_replies table
CREATE TABLE IF NOT EXISTS "tweet_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"organization_id" varchar(255),
	"original_tweet_id" varchar(255) NOT NULL,
	"original_tweet_text" text NOT NULL,
	"original_tweet_author" varchar(255) NOT NULL,
	"original_tweet_author_name" varchar(255),
	"original_tweet_likes" integer DEFAULT 0 NOT NULL,
	"original_tweet_retweets" integer DEFAULT 0 NOT NULL,
	"original_tweet_replies" integer DEFAULT 0 NOT NULL,
	"original_tweet_views" integer DEFAULT 0 NOT NULL,
	"our_reply_text" text NOT NULL,
	"our_reply_tweet_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"replied_at" timestamp
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "tweet_replies_original_tweet_id_idx" ON "tweet_replies" ("original_tweet_id");
CREATE INDEX IF NOT EXISTS "tweet_replies_user_id_idx" ON "tweet_replies" ("user_id");
CREATE INDEX IF NOT EXISTS "tweet_replies_organization_id_idx" ON "tweet_replies" ("organization_id");
CREATE INDEX IF NOT EXISTS "tweet_replies_status_idx" ON "tweet_replies" ("status");
CREATE INDEX IF NOT EXISTS "tweet_replies_created_at_idx" ON "tweet_replies" ("created_at");

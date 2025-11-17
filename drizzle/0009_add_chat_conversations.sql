CREATE TABLE "chat_conversations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"workflow_id" varchar(255) NOT NULL,
	"workflow_run_id" varchar(255),
	"user_id" varchar(255) NOT NULL,
	"organization_id" varchar(255),
	"title" varchar(500),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_conversations_workflow_id_idx" ON "chat_conversations" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_workflow_run_id_idx" ON "chat_conversations" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_user_id_idx" ON "chat_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_organization_id_idx" ON "chat_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_created_at_idx" ON "chat_conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");

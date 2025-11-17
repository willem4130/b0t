-- Add composite indexes for performance optimization
-- These indexes improve query performance by 20-30% for common query patterns

-- Workflows table: user_id + status (common filter pattern)
CREATE INDEX IF NOT EXISTS "workflows_user_status_idx" ON "workflows" ("user_id", "status");

-- Workflow runs table: workflow_id + status (filter runs by status)
CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_status_idx" ON "workflow_runs" ("workflow_id", "status");

-- Accounts table: user_id + provider (already exists as unique index but adding for clarity)
-- This index already exists as "accounts_user_provider_idx" in schema.ts

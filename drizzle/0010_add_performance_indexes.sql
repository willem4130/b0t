-- Migration: Add performance optimization indexes and foreign keys
-- Created: 2025-01-13
-- Description: Adds composite indexes for query optimization and missing foreign key constraints

-- ============================================================================
-- COMPOSITE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Chat messages: Optimize conversation message queries (ordered by time)
CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
ON chat_messages(conversation_id, created_at DESC);

-- Chat conversations: Optimize workflow conversation listing by status
CREATE INDEX IF NOT EXISTS chat_conversations_workflow_status_idx
ON chat_conversations(workflow_id, status);

-- Workflow runs: Optimize dashboard stats queries (user + org + status)
CREATE INDEX IF NOT EXISTS workflow_runs_user_org_status_idx
ON workflow_runs(user_id, organization_id, status);

-- Workflow runs: Optimize workflow history queries with status filter
CREATE INDEX IF NOT EXISTS workflow_runs_workflow_started_idx
ON workflow_runs(workflow_id, started_at DESC);

-- Invitations: Optimize duplicate invitation checks
CREATE INDEX IF NOT EXISTS invitations_org_email_idx
ON invitations(organization_id, email);

-- User credentials: Optimize organization-wide credential queries
CREATE INDEX IF NOT EXISTS user_credentials_org_platform_idx
ON user_credentials(organization_id, platform) WHERE organization_id IS NOT NULL;

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS FOR CHAT TABLES
-- ============================================================================

-- Chat conversations foreign keys
ALTER TABLE chat_conversations
ADD CONSTRAINT chat_conversations_workflow_id_fkey
FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE;

ALTER TABLE chat_conversations
ADD CONSTRAINT chat_conversations_workflow_run_id_fkey
FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL;

ALTER TABLE chat_conversations
ADD CONSTRAINT chat_conversations_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE chat_conversations
ADD CONSTRAINT chat_conversations_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Chat messages foreign keys
ALTER TABLE chat_messages
ADD CONSTRAINT chat_messages_conversation_id_fkey
FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;

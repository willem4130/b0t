-- Denormalize organization status to workflows table for performance
-- Eliminates 1 query per organization workflow execution (50-100ms saved)

-- Add organization_status column to workflows table
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS organization_status VARCHAR(50);

-- Populate with current organization statuses
UPDATE workflows w
SET organization_status = o.status
FROM organizations o
WHERE w.organization_id = o.id AND w.organization_id IS NOT NULL;

-- Create index for queries filtering by organization status
CREATE INDEX IF NOT EXISTS workflows_org_status_idx ON workflows(organization_status) WHERE organization_status IS NOT NULL;

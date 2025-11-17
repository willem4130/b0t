CREATE INDEX "workflow_runs_user_org_started_idx" ON "workflow_runs" USING btree ("user_id","organization_id","started_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_status_started_idx" ON "workflow_runs" USING btree ("workflow_id","status","started_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_status_started_idx" ON "workflow_runs" USING btree ("organization_id","status","started_at");--> statement-breakpoint
CREATE INDEX "workflows_user_org_status_idx" ON "workflows" USING btree ("user_id","organization_id","status");--> statement-breakpoint
CREATE INDEX "workflows_org_status_idx" ON "workflows" USING btree ("organization_id","status");
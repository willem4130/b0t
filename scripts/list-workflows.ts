#!/usr/bin/env tsx
/**
 * List Workflows Script
 *
 * Lists all workflows with filtering options.
 *
 * Usage:
 *   npx tsx scripts/list-workflows.ts
 *   npx tsx scripts/list-workflows.ts --status active
 *   npx tsx scripts/list-workflows.ts --trigger chat
 *   npx tsx scripts/list-workflows.ts --status active --trigger cron
 */

import { db } from '../src/lib/db';
import { workflowsTable } from '../src/lib/schema';
import { eq, and } from 'drizzle-orm';

interface ListOptions {
  status?: string;
  trigger?: string;
}

async function listWorkflows(options: ListOptions = {}): Promise<void> {
  try {
    // Build query conditions
    const conditions = [];
    if (options.status) {
      conditions.push(eq(workflowsTable.status, options.status));
    }

    // Fetch workflows
    const workflows = conditions.length > 0
      ? await db
          .select()
          .from(workflowsTable)
          .where(and(...conditions))
          .orderBy(workflowsTable.createdAt)
      : await db
          .select()
          .from(workflowsTable)
          .orderBy(workflowsTable.createdAt);

    // Filter by trigger type if specified (can't use SQL because trigger is JSONB)
    let filteredWorkflows = workflows;
    if (options.trigger) {
      filteredWorkflows = workflows.filter(w => {
        const trigger = typeof w.trigger === 'string' ? JSON.parse(w.trigger) : w.trigger;
        return trigger.type === options.trigger;
      });
    }

    if (filteredWorkflows.length === 0) {
      console.log('📭 No workflows found');
      if (options.status || options.trigger) {
        console.log(`   Filters: ${options.status ? `status=${options.status}` : ''} ${options.trigger ? `trigger=${options.trigger}` : ''}`);
      }
      process.exit(0);
    }

    console.log(`\n📋 Found ${filteredWorkflows.length} workflow${filteredWorkflows.length === 1 ? '' : 's'}\n`);

    filteredWorkflows.forEach((workflow, index) => {
      const trigger = typeof workflow.trigger === 'string' ? JSON.parse(workflow.trigger) : workflow.trigger;
      const config = typeof workflow.config === 'string' ? JSON.parse(workflow.config) : workflow.config;
      
      console.log(`${index + 1}. ${workflow.name}`);
      console.log(`   ID: ${workflow.id}`);
      console.log(`   Status: ${workflow.status}`);
      console.log(`   Trigger: ${trigger.type}`);
      console.log(`   Steps: ${config.steps?.length || 0}`);
      console.log(`   Created: ${new Date(workflow.createdAt).toLocaleString()}`);
      if (workflow.lastRun) {
        console.log(`   Last Run: ${new Date(workflow.lastRun).toLocaleString()} (${workflow.lastRunStatus || 'unknown'})`);
      }
      console.log();
    });

    console.log(`💡 Tip: Use workflow ID with other scripts:`);
    console.log(`   npx tsx scripts/export-workflow.ts <id>`);
    console.log(`   npx tsx scripts/update-workflow.ts <id> --status active`);
    console.log(`   npx tsx scripts/clone-workflow.ts <id> --name "New Name"`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to list workflows:', error);
    process.exit(1);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options: ListOptions = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Usage:
  npx tsx scripts/list-workflows.ts [options]

Options:
  --status <status>    Filter by status (draft, active, paused, error)
  --trigger <type>     Filter by trigger type (manual, chat, webhook, cron, telegram, discord)
  --help              Show this help message

Examples:
  npx tsx scripts/list-workflows.ts
  npx tsx scripts/list-workflows.ts --status active
  npx tsx scripts/list-workflows.ts --trigger chat
  npx tsx scripts/list-workflows.ts --status active --trigger cron
    `);
    process.exit(0);
  } else if (args[i] === '--status' && args[i + 1]) {
    options.status = args[i + 1];
    i++;
  } else if (args[i] === '--trigger' && args[i + 1]) {
    options.trigger = args[i + 1];
    i++;
  }
}

listWorkflows(options).catch(console.error);

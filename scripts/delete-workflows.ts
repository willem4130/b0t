#!/usr/bin/env tsx

/**
 * Delete workflows from the database
 * Usage:
 *   npm run delete-workflows           # Delete all workflows (with confirmation)
 *   npm run delete-workflows <id>      # Delete specific workflow by ID
 *   npm run delete-workflows --force   # Delete all without confirmation
 */

import { db } from '@/lib/db';
import { workflowsTable, workflowRunsTable } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function deleteAllWorkflows(force = false) {
  try {
    // Get count of workflows
    const workflows = await db.select().from(workflowsTable);
    const count = workflows.length;

    if (count === 0) {
      console.log('✅ No workflows found in database');
      return;
    }

    console.log(`\n⚠️  Found ${count} workflow(s) in database:`);
    workflows.forEach((w) => {
      console.log(`   - ${w.name} (ID: ${w.id})`);
    });

    if (!force) {
      const answer = await askQuestion(
        `\n❌ Delete all ${count} workflow(s)? This will also delete all related workflow runs. (yes/no): `
      );

      if (answer.toLowerCase() !== 'yes') {
        console.log('Cancelled.');
        return;
      }
    }

    // Delete all workflow runs first (foreign key constraint)
    await db.delete(workflowRunsTable);
    console.log(`\n🗑️  Deleted workflow runs`);

    // Delete all workflows
    await db.delete(workflowsTable);
    console.log(`🗑️  Deleted ${count} workflow(s)`);

    console.log('\n✅ All workflows and runs deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting workflows:', error);
    throw error;
  }
}

async function deleteWorkflowById(id: string) {
  try {
    // Check if workflow exists
    const workflow = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .limit(1);

    if (workflow.length === 0) {
      console.log(`❌ Workflow with ID "${id}" not found`);
      return;
    }

    console.log(`\n🗑️  Deleting workflow: ${workflow[0].name} (ID: ${id})`);

    // Delete workflow runs first (foreign key constraint)
    await db.delete(workflowRunsTable).where(eq(workflowRunsTable.workflowId, id));
    console.log('   Deleted workflow runs');

    // Delete workflow
    await db.delete(workflowsTable).where(eq(workflowsTable.id, id));
    console.log('   Deleted workflow');

    console.log('\n✅ Workflow deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting workflow:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No args - delete all with confirmation
    await deleteAllWorkflows(false);
  } else if (args[0] === '--force') {
    // Force flag - delete all without confirmation
    await deleteAllWorkflows(true);
  } else {
    // ID provided - delete specific workflow
    await deleteWorkflowById(args[0]);
  }

  rl.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});

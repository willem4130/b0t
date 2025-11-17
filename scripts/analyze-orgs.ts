#!/usr/bin/env tsx
/**
 * Analyze Organizations Script
 *
 * Analyzes users, organizations, workflows, and credentials to understand data structure.
 */

import { db } from '../src/lib/db';
import { usersTable, organizationsTable, organizationMembersTable, workflowsTable, userCredentialsTable } from '../src/lib/schema';
import { eq, sql } from 'drizzle-orm';

async function analyzeOrganizations(): Promise<void> {
  try {
    console.log('\n🔍 Analyzing Database Structure\n');
    console.log('='.repeat(80));

    // Get all users
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    console.log(`\n👥 USERS (${users.length})\n`);
    users.forEach((user, idx) => {
      console.log(`${idx + 1}. ${user.email} (${user.name || 'No name'})`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Created: ${new Date(user.createdAt).toLocaleString()}\n`);
    });

    // Get all organizations
    const orgs = await db.select().from(organizationsTable).orderBy(organizationsTable.createdAt);
    console.log(`\n🏢 ORGANIZATIONS (${orgs.length})\n`);

    for (const org of orgs) {
      const owner = users.find(u => u.id === org.ownerId);
      const members = await db
        .select()
        .from(organizationMembersTable)
        .where(eq(organizationMembersTable.organizationId, org.id));

      const workflows = await db
        .select()
        .from(workflowsTable)
        .where(eq(workflowsTable.organizationId, org.id));

      const credentials = await db
        .select()
        .from(userCredentialsTable)
        .where(eq(userCredentialsTable.organizationId, org.id));

      console.log(`📁 ${org.name} (${org.slug})`);
      console.log(`   ID: ${org.id}`);
      console.log(`   Owner: ${owner?.email || 'Unknown'}`);
      console.log(`   Plan: ${org.plan} | Status: ${org.status}`);
      console.log(`   Members: ${members.length}`);
      members.forEach(m => {
        const user = users.find(u => u.id === m.userId);
        console.log(`     - ${user?.email} (${m.role})`);
      });
      console.log(`   Workflows: ${workflows.length}`);
      workflows.forEach(w => {
        console.log(`     - ${w.name} (${w.status})`);
      });
      console.log(`   Credentials: ${credentials.length}`);
      credentials.forEach(c => {
        console.log(`     - ${c.name} (${c.platform})`);
      });
      console.log(`   Created: ${new Date(org.createdAt).toLocaleString()}\n`);
    }

    // Check for user-level (non-org) workflows
    const userWorkflows = await db
      .select()
      .from(workflowsTable)
      .where(sql`${workflowsTable.organizationId} IS NULL`);

    if (userWorkflows.length > 0) {
      console.log(`\n📋 USER-LEVEL WORKFLOWS (no org, ${userWorkflows.length})\n`);
      for (const wf of userWorkflows) {
        const user = users.find(u => u.id === wf.userId);
        console.log(`- ${wf.name} (${wf.status})`);
        console.log(`  Owner: ${user?.email || 'Unknown'}`);
        console.log(`  ID: ${wf.id}\n`);
      }
    }

    // Check for user-level credentials
    const userCreds = await db
      .select()
      .from(userCredentialsTable)
      .where(sql`${userCredentialsTable.organizationId} IS NULL`);

    if (userCreds.length > 0) {
      console.log(`\n🔑 USER-LEVEL CREDENTIALS (no org, ${userCreds.length})\n`);
      for (const cred of userCreds) {
        const user = users.find(u => u.id === cred.userId);
        console.log(`- ${cred.name} (${cred.platform})`);
        console.log(`  Owner: ${user?.email || 'Unknown'}`);
        console.log(`  ID: ${cred.id}\n`);
      }
    }

    console.log('='.repeat(80));
    console.log('\n✅ Analysis complete\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to analyze:', error);
    process.exit(1);
  }
}

analyzeOrganizations().catch(console.error);

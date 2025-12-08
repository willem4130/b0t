#!/usr/bin/env tsx
/**
 * Import Workflow Script
 *
 * Imports a workflow JSON file into the database via the API.
 * Makes workflow creation from CLI/scripts much easier.
 *
 * Usage:
 *   npx tsx scripts/import-workflow.ts <workflow-file.json>
 *   npx tsx scripts/import-workflow.ts --stdin < workflow.json
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { type WorkflowExport } from '../src/lib/workflows/import-export';

const API_URL = process.env.API_URL || 'http://localhost:3123';
const PORT = API_URL.split(':').pop() || '3123';

async function checkServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/system/status`, {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

function killServerOnPort(): void {
  try {
    execSync(`lsof -i:${PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null`, {
      stdio: 'ignore',
    });
  } catch {
    // Server wasn't running, that's fine
  }
}

function startServer(): void {
  console.log('🚀 Starting development server...');
  // Start server in background using spawn would be better, but execSync is simpler
  // User will need to manually manage the background process
  console.log('💡 Run this in another terminal: npm run dev:full');
  console.log('   Or the script will attempt to continue...');
}

async function waitForServer(maxWaitSeconds: number = 30): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    if (await checkServerRunning()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function importWorkflow(workflowJson: string): Promise<void> {
  try {
    // Validate JSON
    const workflow = JSON.parse(workflowJson) as WorkflowExport;

    console.log(`📦 Importing workflow: ${workflow.name}`);
    console.log(`📝 Description: ${workflow.description}`);
    console.log(`🔧 Steps: ${workflow.config.steps.length}`);

    if (workflow.metadata?.requiresCredentials?.length) {
      console.log(`🔑 Required credentials: ${workflow.metadata.requiresCredentials.join(', ')}`);
    }

    // Check if server is running, restart if needed
    console.log('\n🔍 Checking if server is running...');
    let serverRunning = await checkServerRunning();

    if (!serverRunning) {
      console.log('⚠️  Server not running, starting it...');
      killServerOnPort(); // Kill any stale processes
      startServer();
      console.log('⏳ Waiting for server to be ready...');
      serverRunning = await waitForServer(30);

      if (!serverRunning) {
        console.error(`❌ Server failed to start within 30 seconds`);
        console.error(`   Try starting manually: npm run dev:full`);
        process.exit(1);
      }
    }

    console.log(`✅ Server is running at ${API_URL}\n`);

    // Import via API (use test endpoint in development for no-auth import)
    const importEndpoint = process.env.NODE_ENV === 'production'
      ? `${API_URL}/api/workflows/import`
      : `${API_URL}/api/workflows/import-test`;

    let response: Response | undefined;
    let importAttempt = 1;
    const maxAttempts = 2;

    while (importAttempt <= maxAttempts) {
      try {
        console.log(`📤 Import attempt ${importAttempt}/${maxAttempts}...`);

        response = await fetch(importEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowJson }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        break; // Success, exit loop
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError' && importAttempt < maxAttempts) {
          console.log('⚠️  Import taking too long (>10s), server might be frozen');
          console.log('🔄 Killing frozen server and retrying...');

          killServerOnPort();
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s for cleanup

          console.log('💡 Please restart server manually: npm run dev:full');
          console.log('⏳ Waiting 30s for server...');
          const restarted = await waitForServer(30);

          if (!restarted) {
            console.error('❌ Server not available after restart attempt');
            console.error('   Please start server manually and re-run import');
            process.exit(1);
          }

          importAttempt++;
        } else {
          throw error; // Re-throw non-timeout errors
        }
      }
    }

    if (!response) {
      console.error('❌ Import failed after all attempts');
      process.exit(1);
    }

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Import failed:', error.error);
      if (error.details) {
        console.error('   Details:', error.details);
      }
      process.exit(1);
    }

    const result = await response.json();
    console.log('\n✅ Workflow imported successfully!');
    console.log(`   ID: ${result.id}`);
    console.log(`   Name: ${result.name}`);
    console.log(`\n🌐 View at: ${API_URL}/dashboard/workflows`);

    if (result.requiredCredentials?.length) {
      console.log(`\n⚠️  Configure credentials for: ${result.requiredCredentials.join(', ')}`);
      console.log(`   Go to: ${API_URL}/settings/credentials`);
    }
  } catch (error) {
    console.error('❌ Failed to import workflow:', error);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage:
  npx tsx scripts/import-workflow.ts <workflow-file.json>
  npx tsx scripts/import-workflow.ts --stdin < workflow.json

Options:
  --stdin    Read workflow JSON from stdin
  --help     Show this help message

Environment:
  API_URL    API base URL (default: http://localhost:3123)
  `);
  process.exit(0);
}

let workflowJson: string;

if (args[0] === '--stdin') {
  // Read from stdin
  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    workflowJson = Buffer.concat(chunks).toString('utf-8');
    importWorkflow(workflowJson);
  });
} else {
  // Read from file
  const filePath = resolve(process.cwd(), args[0]);
  try {
    workflowJson = readFileSync(filePath, 'utf-8');
    importWorkflow(workflowJson);
  } catch (error) {
    console.error(`❌ Failed to read file: ${filePath}`);
    console.error(error);
    process.exit(1);
  }
}

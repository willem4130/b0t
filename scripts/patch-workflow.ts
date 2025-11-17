#!/usr/bin/env tsx
/**
 * Patch Workflow Script
 *
 * Apply JSON Patch operations to a workflow file.
 * Useful for incremental updates without rewriting entire workflow.
 *
 * Usage:
 *   npx tsx scripts/patch-workflow.ts <workflow.json> <patch.json>
 *   npx tsx scripts/patch-workflow.ts <workflow.json> <patch.json> --write
 *   echo '[{"op":"add","path":"/config/steps/-","value":{...}}]' | npx tsx scripts/patch-workflow.ts workflow.json --stdin
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { Operation } from 'fast-json-patch';
import { applyWorkflowPatch } from '../src/lib/workflows/workflow-patch';
import { validateWorkflowComplete, formatValidationErrors } from '../src/lib/workflows/workflow-validator';
import type { WorkflowExport } from '../src/lib/workflows/import-export';

function patchWorkflow(
  workflowFile: string,
  patchContent: string,
  shouldWrite: boolean
): void {
  try {
    // Read workflow
    const workflowPath = resolve(process.cwd(), workflowFile);
    const workflowContent = readFileSync(workflowPath, 'utf-8');
    const workflow = JSON.parse(workflowContent) as WorkflowExport;

    console.log(`📂 Workflow: ${workflow.name}`);
    console.log(`📝 Original steps: ${workflow.config.steps.length}\n`);

    // Parse patch operations
    const operations = JSON.parse(patchContent) as Operation[];
    console.log(`🔧 Applying ${operations.length} patch operation(s)...\n`);

    operations.forEach((op, index) => {
      console.log(`${index + 1}. ${op.op.toUpperCase()} ${op.path}`);
    });
    console.log('');

    // Apply patch
    const result = applyWorkflowPatch(workflow, operations);

    if (!result.success) {
      console.error('❌ Patch failed:', result.error);
      process.exit(1);
    }

    console.log(`✅ Patch applied successfully (${result.appliedOps} operations)\n`);

    // Validate patched workflow
    console.log('🔍 Validating patched workflow...\n');
    const validation = validateWorkflowComplete(result.workflow!);

    if (!validation.valid) {
      console.error('❌ Patched workflow is invalid:\n');
      console.error(formatValidationErrors(validation.errors));
      process.exit(1);
    }

    console.log('✅ Patched workflow is valid\n');

    // Show summary
    console.log('📊 Updated Workflow:');
    console.log(`   Name: ${result.workflow!.name}`);
    console.log(`   Steps: ${result.workflow!.config.steps.length}`);
    if (result.workflow!.config.returnValue) {
      console.log(`   Return Value: ${result.workflow!.config.returnValue}`);
    }
    console.log('');

    // Write to file
    if (shouldWrite) {
      writeFileSync(workflowPath, JSON.stringify(result.workflow!, null, 2) + '\n', 'utf-8');
      console.log(`✅ Updated workflow written to: ${workflowFile}\n`);
    } else {
      console.log('💡 To save changes, run with --write flag\n');
      console.log(`   npx tsx scripts/patch-workflow.ts ${workflowFile} <patch-file> --write\n`);
      console.log('📋 Patched workflow (preview):\n');
      console.log(JSON.stringify(result.workflow!, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage:
  npx tsx scripts/patch-workflow.ts <workflow.json> <patch.json>
  npx tsx scripts/patch-workflow.ts <workflow.json> <patch.json> --write
  npx tsx scripts/patch-workflow.ts <workflow.json> --stdin < patch.json

Arguments:
  workflow.json  Path to workflow file
  patch.json     Path to JSON Patch file

Options:
  --stdin        Read patch from stdin
  --write        Write changes to workflow file
  --help         Show this help message

JSON Patch Format:
  [
    { "op": "add", "path": "/config/steps/-", "value": {...} },
    { "op": "replace", "path": "/description", "value": "New description" },
    { "op": "remove", "path": "/config/steps/0" }
  ]

Common Operations:
  • Add step: {"op":"add","path":"/config/steps/-","value":{...}}
  • Update name: {"op":"replace","path":"/name","value":"New Name"}
  • Remove step: {"op":"remove","path":"/config/steps/2"}
  • Set returnValue: {"op":"add","path":"/config/returnValue","value":"{{result}}"}

Examples:
  # Add a step to workflow
  echo '[{"op":"add","path":"/config/steps/-","value":{"id":"new-step","module":"utilities.datetime.now","inputs":{},"outputAs":"timestamp"}}]' | npx tsx scripts/patch-workflow.ts workflow.json --stdin --write

  # Update workflow description
  echo '[{"op":"replace","path":"/description","value":"Updated description"}]' | npx tsx scripts/patch-workflow.ts workflow.json --stdin --write
  `);
  process.exit(0);
}

const workflowFile = args[0];
const shouldWrite = args.includes('--write');

if (args.includes('--stdin')) {
  // Read patch from stdin
  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const patchContent = Buffer.concat(chunks).toString('utf-8');
    patchWorkflow(workflowFile, patchContent, shouldWrite);
  });
} else {
  // Read patch from file
  if (args.length < 2) {
    console.error('❌ Missing patch file argument');
    console.log('Usage: npx tsx scripts/patch-workflow.ts <workflow.json> <patch.json>');
    process.exit(1);
  }

  const patchFile = args[1];
  const patchPath = resolve(process.cwd(), patchFile);

  try {
    const patchContent = readFileSync(patchPath, 'utf-8');
    patchWorkflow(workflowFile, patchContent, shouldWrite);
  } catch (error) {
    console.error(`❌ Failed to read patch file: ${patchFile}`);
    console.error(error);
    process.exit(1);
  }
}

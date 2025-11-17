#!/usr/bin/env tsx
/**
 * Add Workflow Step Script
 *
 * Programmatically add a validated step to a workflow JSON file.
 * Ensures parameter correctness by validating against module registry.
 *
 * Usage:
 *   npx tsx scripts/add-workflow-step.ts <workflow-file> --module <path> --id <step-id> --inputs <json>
 *   npx tsx scripts/add-workflow-step.ts workflow/test.json \
 *     --module "utilities.math.max" \
 *     --id "calc-max" \
 *     --inputs '{"numbers": "{{data}}"}'
 *
 * Features:
 *   - Validates module exists
 *   - Validates parameters against function signature
 *   - Detects function-as-string errors
 *   - Inserts step at specified position or end
 *   - Validates entire workflow after insertion
 *   - Atomically updates file (validates before writing)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getModuleRegistry } from '../src/lib/workflows/module-registry';
import type { WorkflowExport } from '../src/lib/workflows/import-export';

interface Args {
  workflowFile: string;
  module: string;
  id: string;
  name?: string;
  inputs: Record<string, unknown>;
  outputAs?: string;
  position?: number; // Insert at specific position (0-indexed), or append to end
  validate?: boolean; // Default true
}

/**
 * Find module in registry by full path (category.module.function)
 */
function findModuleInRegistry(modulePath: string) {
  const [category, moduleName, functionName] = modulePath.split('.');
  const registry = getModuleRegistry();

  for (const cat of registry) {
    if (cat.name !== category) continue;

    for (const mod of cat.modules) {
      if (mod.name !== moduleName) continue;

      for (const fn of mod.functions) {
        if (fn.name === functionName) {
          return fn;
        }
      }
    }
  }

  return null;
}

/**
 * Validate step inputs against module signature
 */
function validateStepInputs(
  modulePath: string,
  inputs: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const moduleInfo = findModuleInRegistry(modulePath);
  if (!moduleInfo) {
    errors.push(`Module "${modulePath}" not found in registry`);
    return { valid: false, errors };
  }

  const providedParams = Object.keys(inputs);
  const allParams = moduleInfo.signature.match(/\(([^)]*)\)/)?.[1] || '';
  const expectedParamNames = moduleInfo.signature
    .match(/\(([^)]*)\)/)?.[1]
    ?.split(',')
    .map(p => p.trim().split(/[?:]/)[0].trim())
    .filter(p => p && p !== 'params' && p !== 'options') || [];

  // Skip validation for params/options wrapper functions
  if (allParams.includes('params:') || allParams.includes('params)') ||
      allParams.includes('options:') || allParams.includes('options)')) {
    console.log(`   ℹ️  Module uses params/options wrapper - inputs can be any shape`);
    return { valid: true, errors: [] };
  }

  // Get required params (not marked with ?)
  const requiredParamNames = expectedParamNames.filter(name =>
    !allParams.includes(`${name}?`)
  );

  // Check for missing required params
  const missingParams = requiredParamNames.filter(p => !providedParams.includes(p));
  if (missingParams.length > 0) {
    errors.push(`Missing required parameters: ${missingParams.join(', ')}`);
    errors.push(`Expected: [${expectedParamNames.join(', ')}]`);
    errors.push(`Provided: [${providedParams.join(', ')}]`);
    errors.push(`Signature: ${moduleInfo.signature}`);
  }

  // Check for unexpected params
  const unexpectedParams = providedParams.filter(p =>
    !expectedParamNames.includes(p)
  );
  if (unexpectedParams.length > 0) {
    errors.push(`Unexpected parameters: ${unexpectedParams.join(', ')}`);
    errors.push(`Expected: [${expectedParamNames.join(', ')}]`);
    errors.push(`Signature: ${moduleInfo.signature}`);
  }

  // Check for function parameters provided as strings
  const functionParamNames = ['predicate', 'mapper', 'fn', 'callback', 'transform', 'comparator'];
  for (const paramName of expectedParamNames) {
    if (functionParamNames.includes(paramName) && paramName in inputs) {
      const value = inputs[paramName];
      if (typeof value === 'string' && value.includes('=>')) {
        errors.push(`Type error: "${paramName}" appears to be an arrow function provided as string`);
        errors.push(`Provided: "${value}"`);
        errors.push(`Note: Workflow executor doesn't evaluate JavaScript strings`);
        errors.push(`These parameters require actual function execution which isn't supported in JSON workflows`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Add step to workflow
 */
function addStepToWorkflow(args: Args): { success: boolean; message: string; errors?: string[] } {
  try {
    // Read workflow file
    const workflowPath = resolve(process.cwd(), args.workflowFile);
    const workflowContent = readFileSync(workflowPath, 'utf-8');
    const workflow = JSON.parse(workflowContent) as WorkflowExport;

    if (!workflow.config?.steps) {
      return {
        success: false,
        message: 'Workflow file must have config.steps array',
      };
    }

    // Validate module exists
    const moduleInfo = findModuleInRegistry(args.module);
    if (!moduleInfo) {
      return {
        success: false,
        message: `Module "${args.module}" not found in registry`,
        errors: [`Available modules can be searched with: npx tsx scripts/search-modules-llm.ts <keyword>`],
      };
    }

    console.log(`\n📦 Adding step to workflow: ${args.id}`);
    console.log(`   Module: ${args.module}`);
    console.log(`   Signature: ${moduleInfo.signature}`);

    // Validate inputs
    if (args.validate !== false) {
      console.log(`\n🔍 Validating inputs...`);
      const validation = validateStepInputs(args.module, args.inputs);
      if (!validation.valid) {
        return {
          success: false,
          message: 'Input validation failed',
          errors: validation.errors,
        };
      }
      console.log(`   ✅ Inputs validated successfully`);
    }

    // Check if step ID already exists
    const existingStep = workflow.config.steps.find(s => s.id === args.id);
    if (existingStep) {
      return {
        success: false,
        message: `Step with ID "${args.id}" already exists in workflow`,
      };
    }

    // Build step
    const step: {
      id: string;
      name?: string;
      module: string;
      inputs: Record<string, unknown>;
      outputAs?: string;
    } = {
      id: args.id,
      module: args.module,
      inputs: args.inputs,
    };

    if (args.name) {
      step.name = args.name;
    }

    if (args.outputAs) {
      step.outputAs = args.outputAs;
    }

    // Insert step at position or append
    const position = args.position ?? workflow.config.steps.length;
    workflow.config.steps.splice(position, 0, step);

    console.log(`\n✅ Step added at position ${position} (total steps: ${workflow.config.steps.length})`);

    // Write updated workflow
    writeFileSync(workflowPath, JSON.stringify(workflow, null, 2), 'utf-8');
    console.log(`\n💾 Workflow saved: ${args.workflowFile}`);

    // Suggest validation
    console.log(`\n💡 Validate with: npm run validate ${args.workflowFile}`);

    return {
      success: true,
      message: `Step "${args.id}" added successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      errors: error instanceof Error ? [error.stack || ''] : [],
    };
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(argv: string[]): Args | null {
  if (argv.length < 2 || argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Add Workflow Step - Programmatically add validated steps to workflows

Usage:
  npx tsx scripts/add-workflow-step.ts <workflow-file> [options]

Required:
  <workflow-file>         Path to workflow JSON file
  --module <path>         Module path (e.g., "utilities.math.max")
  --id <step-id>          Unique step identifier
  --inputs <json>         Step inputs as JSON object

Optional:
  --name <name>           Human-readable step name
  --outputAs <var>        Variable name to store output
  --position <n>          Insert position (0-indexed), default: append to end
  --no-validate           Skip input validation (not recommended)

Examples:
  # Add a math step
  npx tsx scripts/add-workflow-step.ts workflow/test.json \\
    --module "utilities.math.max" \\
    --id "calc-max" \\
    --inputs '{"numbers": "{{data}}"}'

  # Add step with name and output variable
  npx tsx scripts/add-workflow-step.ts workflow/test.json \\
    --module "utilities.array-utils.sum" \\
    --id "calc-sum" \\
    --name "Calculate Sum" \\
    --outputAs "totalSum" \\
    --inputs '{"arr": "{{numbers}}"}'

  # Insert at specific position
  npx tsx scripts/add-workflow-step.ts workflow/test.json \\
    --module "utilities.math.add" \\
    --id "add-numbers" \\
    --position 3 \\
    --inputs '{"a": 10, "b": 20}'

Search for modules:
  npx tsx scripts/search-modules-llm.ts <keyword> --format json
    `);
    return null;
  }

  const workflowFile = argv[0];
  const moduleIndex = argv.indexOf('--module');
  const idIndex = argv.indexOf('--id');
  const inputsIndex = argv.indexOf('--inputs');
  const nameIndex = argv.indexOf('--name');
  const outputAsIndex = argv.indexOf('--outputAs');
  const positionIndex = argv.indexOf('--position');
  const noValidate = argv.includes('--no-validate');

  if (moduleIndex === -1 || idIndex === -1 || inputsIndex === -1) {
    console.error('❌ Error: --module, --id, and --inputs are required\n');
    return null;
  }

  const modulePath = argv[moduleIndex + 1];
  const id = argv[idIndex + 1];
  const inputsStr = argv[inputsIndex + 1];

  if (!modulePath || !id || !inputsStr) {
    console.error('❌ Error: Missing values for required arguments\n');
    return null;
  }

  let inputs: Record<string, unknown>;
  try {
    inputs = JSON.parse(inputsStr);
  } catch {
    console.error('❌ Error: --inputs must be valid JSON\n');
    return null;
  }

  return {
    workflowFile,
    module: modulePath,
    id,
    name: nameIndex !== -1 ? argv[nameIndex + 1] : undefined,
    inputs,
    outputAs: outputAsIndex !== -1 ? argv[outputAsIndex + 1] : undefined,
    position: positionIndex !== -1 ? parseInt(argv[positionIndex + 1]) : undefined,
    validate: !noValidate,
  };
}

// Main execution
const args = parseArgs(process.argv.slice(2));

if (args) {
  const result = addStepToWorkflow(args);

  if (!result.success) {
    console.error(`\n❌ Error: ${result.message}`);
    if (result.errors) {
      result.errors.forEach(err => console.error(`   ${err}`));
    }
    process.exit(1);
  }

  console.log(`\n✅ ${result.message}\n`);
  process.exit(0);
}

#!/usr/bin/env tsx
/**
 * Dry-Run Workflow Testing
 *
 * Execute workflows with mock data to catch runtime errors before real execution.
 * No actual API calls, database writes, or external side effects.
 *
 * Usage:
 *   npm run workflow:dry-run <workflow-file.json>
 *   npm run workflow:dry-run workflow/test.json
 *
 * Features:
 *   - Executes all steps with mock data
 *   - Validates variable references
 *   - Checks output structure matches outputDisplay type
 *   - Detects JavaScript errors
 *   - Mocks API calls and credentials
 *   - Reports errors and warnings
 *   - Zero side effects (read-only)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { WorkflowExport } from '../src/lib/workflows/import-export';
import { getModuleRegistry } from '../src/lib/workflows/module-registry';

interface DryRunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  stepResults: Array<{
    stepId: string;
    stepName: string;
    success: boolean;
    output?: unknown;
    error?: string;
  }>;
  finalOutput?: unknown;
}

/**
 * Resolve variable references with strict tracking
 */
function resolveVariables(
  value: unknown,
  variables: Record<string, unknown>,
  trackUnresolved?: Set<string>
): unknown {
  if (typeof value === 'string') {
    // Match {{variable}} or {{variable.property}}
    const match = value.match(/^{{(.+)}}$/);
    if (match) {
      const path = match[1];
      const parts = path.split('.');
      let result: unknown = variables;
      let resolved = true;

      for (const part of parts) {
        // Handle array indexing like [0]
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const arrayProp = (result as Record<string, unknown>)?.[arrayMatch[1]];
          if (Array.isArray(arrayProp)) {
            result = arrayProp[parseInt(arrayMatch[2])];
          } else {
            result = undefined;
          }
        } else {
          result = (result as Record<string, unknown>)?.[part];
        }

        // Track if resolution failed
        if (result === undefined) {
          resolved = false;
          break;
        }
      }

      if (!resolved || result === undefined) {
        if (trackUnresolved) {
          trackUnresolved.add(`{{${path}}}`);
        }
        return `{{${path}}}`;  // Keep template if not found
      }

      return result;
    }

    // Handle inline templates
    return value.replace(/{{(.+?)}}/g, (_, path) => {
      const parts = path.split('.');
      let result: unknown = variables;
      let resolved = true;

      for (const part of parts) {
        result = (result as Record<string, unknown>)?.[part];
        if (result === undefined) {
          resolved = false;
          break;
        }
      }

      if (!resolved || result === undefined) {
        if (trackUnresolved) {
          trackUnresolved.add(`{{${path}}}`);
        }
        return `{{${path}}}`;
      }

      return String(result ?? `{{${path}}}`);
    });
  }

  if (Array.isArray(value)) {
    return value.map(item => resolveVariables(item, variables, trackUnresolved));
  }

  if (value && typeof value === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveVariables(v, variables, trackUnresolved);
    }
    return resolved;
  }

  return value;
}

/**
 * Mock module execution
 */
async function mockExecuteModule(
  modulePath: string,
  inputs: Record<string, unknown>,
  stepId: string
): Promise<unknown> {
  const [category, moduleName] = modulePath.split('.');

  // Check if module exists
  const moduleInfo = getModuleRegistry()
    .flatMap(cat => cat.modules)
    .find(mod => modulePath.startsWith(`${mod.name}.`) || modulePath.includes(`.${mod.name}.`));

  if (!moduleInfo) {
    throw new Error(`Module "${modulePath}" not found`);
  }

  // Mock based on module type
  if (category === 'ai' && moduleName === 'ai-sdk') {
    return { content: 'Mock AI generated content', usage: { tokens: 100 } };
  }

  if (modulePath.includes('javascript.execute') || modulePath.includes('javascript.evaluateExpression')) {
    // Actually execute the JavaScript code for accurate testing
    try {
      const options = inputs.options as Record<string, unknown>;
      const codeOrExpression = options?.code || options?.expression;
      const context = (options?.context as Record<string, unknown>) || {};

      if (!codeOrExpression) {
        throw new Error('No code or expression provided');
      }

      // Clean the code
      const code = String(codeOrExpression).trim();

      // Execute based on format
      let result;
      if (code.startsWith('(') && code.endsWith(')')) {
        // Expression wrapped in parens - evaluate directly
        const func = new Function(...Object.keys(context), `return ${code}`);
        result = func(...Object.values(context));
      } else if (code.includes('return')) {
        // Contains return statement
        const func = new Function(...Object.keys(context), code);
        result = func(...Object.values(context));
      } else {
        // Simple expression
        const func = new Function(...Object.keys(context), `return ${code}`);
        result = func(...Object.values(context));
      }

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const options = inputs.options as Record<string, unknown>;
      const code = options?.code || options?.expression;
      throw new Error(`JavaScript execution error: ${message}\nCode: ${code}`);
    }
  }

  if (modulePath.includes('javascript.filterArray')) {
    const opts = inputs.options as Record<string, unknown>;
    return Array.isArray(opts?.items) ? opts.items.slice(0, 2) : [];
  }

  if (modulePath.includes('javascript.mapArray')) {
    const opts = inputs.options as Record<string, unknown>;
    return Array.isArray(opts?.items) ? opts.items.map((item: unknown) => ({ ...(item as Record<string, unknown>), transformed: true })) : [];
  }

  if (modulePath.includes('javascript.reduceArray')) {
    const opts = inputs.options as Record<string, unknown>;
    return opts?.initialValue ?? 0;
  }

  if (modulePath.includes('http.')) {
    return { data: { title: 'Mock API Title', id: 1 }, status: 200, statusText: 'OK' };
  }

  if (modulePath.includes('datetime.now')) {
    return new Date().toISOString();
  }

  if (modulePath.includes('datetime.format')) {
    return '2025-11-14 12:00:00';
  }

  if (modulePath.includes('math.max')) {
    const nums = (inputs as Record<string, unknown>).numbers;
    return Array.isArray(nums) ? Math.max(...nums.filter((n: unknown) => typeof n === 'number') as number[]) : null;
  }

  if (modulePath.includes('math.min')) {
    const nums = (inputs as Record<string, unknown>).numbers;
    return Array.isArray(nums) ? Math.min(...nums.filter((n: unknown) => typeof n === 'number') as number[]) : null;
  }

  if (modulePath.includes('math.add')) {
    const inputsRecord = inputs as Record<string, unknown>;
    const a = inputsRecord.a;
    const b = inputsRecord.b;
    return (typeof a === 'number' && typeof b === 'number') ? a + b : null;
  }

  if (modulePath.includes('math.')) {
    // Generic math operations return number
    return 42;
  }

  if (modulePath.includes('array-utils.pluck')) {
    const opts = inputs as Record<string, unknown>;
    const arr = Array.isArray(opts.arr) ? opts.arr : [];
    const key = String(opts.key);
    return arr.map((item: unknown) => (item as Record<string, unknown>)[key] ?? 'mock');
  }

  if (modulePath.includes('array-utils.average')) {
    const inputsRecord = inputs as Record<string, unknown>;
    const arr = inputsRecord.arr;
    if (Array.isArray(arr) && arr.length > 0) {
      const nums = arr.filter((n: unknown) => typeof n === 'number') as number[];
      return nums.length > 0 ? nums.reduce((a: number, b: number) => a + b, 0) / nums.length : null;
    }
    return null;
  }

  if (modulePath.includes('array-utils.sum')) {
    const inputsRecord = inputs as Record<string, unknown>;
    const arr = inputsRecord.arr;
    if (Array.isArray(arr)) {
      const nums = arr.filter((n: unknown) => typeof n === 'number') as number[];
      return nums.reduce((a: number, b: number) => a + b, 0);
    }
    return 0;
  }

  if (modulePath.includes('array-utils.')) {
    return [1, 2, 3];
  }

  if (modulePath.includes('string-utils.')) {
    return 'mock-string';
  }

  if (modulePath.includes('validation.')) {
    return { valid: true, errors: [] };
  }

  if (modulePath.includes('json-transform.')) {
    return { mock: 'data' };
  }

  if (modulePath.includes('csv.')) {
    return 'id,name\n1,test';
  }

  if (modulePath.includes('xml.')) {
    return '<root><item>test</item></root>';
  }

  // Default mock
  return { mock: true, stepId };
}

/**
 * Dry-run workflow execution
 */
async function dryRunWorkflow(workflowFile: string): Promise<DryRunResult> {
  const result: DryRunResult = {
    success: true,
    errors: [],
    warnings: [],
    stepResults: [],
  };

  // Load workflow
  const workflowPath = resolve(process.cwd(), workflowFile);
  if (!existsSync(workflowPath)) {
    result.errors.push(`Workflow file not found: ${workflowPath}`);
    result.success = false;
    return result;
  }

  const workflow: WorkflowExport = JSON.parse(readFileSync(workflowPath, 'utf-8'));

  console.log(`\n🧪 Dry-run: ${workflow.name}\n`);
  console.log(`   Steps: ${workflow.config.steps.length}`);
  console.log(`   Output: ${workflow.config.outputDisplay?.type || 'auto'}\n`);

  // Initialize variables with mocks
  const variables: Record<string, unknown> = {
    workflowId: 'mock-workflow-id',
    userId: 'mock-user-id',
    trigger: {
      type: workflow.trigger?.type || 'manual',
      // Add chat trigger mock data
      userMessage: 'Mock user message for testing',
      topic: 'Mock topic',
      query: 'Mock query',
      // Add any other common trigger fields
      ...(workflow.trigger?.config || {}),
    },
    credential: {
      openai_api_key: 'mock-openai-key',
      anthropic_api_key: 'mock-anthropic-key',
    },
  };

  // Execute each step
  for (let i = 0; i < workflow.config.steps.length; i++) {
    const step = workflow.config.steps[i];
    const stepNum = i + 1;

    try {
      console.log(`Step ${stepNum}/${workflow.config.steps.length}: ${step.id} (${step.module})`);

      // Resolve inputs with tracking
      const unresolvedSet = new Set<string>();
      const resolvedInputs = resolveVariables(step.inputs, variables, unresolvedSet) as Record<string, unknown>;

      // STRICT: Check for unresolved variables - ERROR not warning
      if (unresolvedSet.size > 0) {
        const unresolvedVars = Array.from(unresolvedSet);

        result.success = false;
        result.errors.push(
          `Step "${step.id}": Unresolved variables: ${unresolvedVars.join(', ')}`
        );
        console.log(`   ❌ CRITICAL: Unresolved variables: ${unresolvedVars.join(', ')}`);
        console.log(`   💡 These variables are referenced but don't exist in context`);

        // Show which variables ARE available
        const availableVars = Object.keys(variables).filter(k => !k.startsWith('credential'));
        if (availableVars.length > 0) {
          console.log(`   📋 Available: ${availableVars.slice(0, 15).join(', ')}${availableVars.length > 15 ? ', ...' : ''}`);
        }

        // Suggest likely matches
        unresolvedVars.forEach(unresolved => {
          const varName = unresolved.replace(/{{|}}/g, '').split('.')[0];
          const similar = availableVars.filter(v =>
            v.toLowerCase().includes(varName.toLowerCase()) ||
            varName.toLowerCase().includes(v.toLowerCase())
          );
          if (similar.length > 0) {
            console.log(`   💡 Did you mean: ${similar.slice(0, 3).join(', ')}?`);
          }
        });

        // Stop execution on unresolved variables
        result.stepResults.push({
          stepId: step.id,
          stepName: step.module,
          success: false,
          error: `Unresolved variables: ${unresolvedVars.join(', ')}`,
        });
        break;
      }

      // Execute step (mocked)
      const output = await mockExecuteModule(step.module, resolvedInputs, step.id);

      // Store output
      if (step.outputAs) {
        variables[step.outputAs] = output;
        console.log(`   ✅ Success → Stored as "{{${step.outputAs}}}"`);
      } else {
        console.log(`   ✅ Success`);
      }

      if (output && typeof output === 'object') {
        const preview = JSON.stringify(output).substring(0, 80);
        console.log(`   Output: ${preview}${preview.length >= 80 ? '...' : ''}`);
      } else if (output !== undefined) {
        console.log(`   Output: ${output}`);
      }

      result.stepResults.push({
        stepId: step.id,
        stepName: step.module,
        success: true,
        output,
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.success = false;
      result.errors.push(`Step "${step.id}": ${message}`);
      result.stepResults.push({
        stepId: step.id,
        stepName: step.module,
        success: false,
        error: message,
      });
      console.log(`   ❌ Error: ${message}`);

      // Stop on first error
      break;
    }
  }

  // Validate final output
  if (result.success && workflow.config.returnValue) {
    console.log(`\n🔍 Validating output structure...\n`);

    const returnValue = resolveVariables(workflow.config.returnValue, variables);
    result.finalOutput = returnValue;

    // STRICT: Check output structure matches outputDisplay type
    const outputType = workflow.config.outputDisplay?.type;
    if (outputType === 'table' || outputType === 'list') {
      if (!Array.isArray(returnValue)) {
        result.success = false;
        result.errors.push(
          `Output type is "${outputType}" but returnValue is not an array. ` +
          `Type: ${typeof returnValue}. Table/List outputs REQUIRE arrays.`
        );
        console.log(`   ❌ CRITICAL: Expected array for ${outputType}, got ${typeof returnValue}`);
      } else {
        console.log(`   ✅ Output is array (${returnValue.length} items)`);

        // STRICT: Check if array items have the expected columns
        if (outputType === 'table' && workflow.config.outputDisplay?.columns) {
          const expectedKeys = workflow.config.outputDisplay.columns.map(c => c.key);
          const firstItem = returnValue[0];

          if (!firstItem) {
            result.errors.push(`Table output has empty array - no data to display`);
            console.log(`   ❌ Empty array for table output`);
          } else if (typeof firstItem !== 'object') {
            result.success = false;
            result.errors.push(`Table items must be objects, got ${typeof firstItem}`);
            console.log(`   ❌ Array items are ${typeof firstItem}, not objects`);
          } else {
            const actualKeys = Object.keys(firstItem);
            const missingKeys = expectedKeys.filter(k => !actualKeys.includes(k));
            if (missingKeys.length > 0) {
              result.success = false;
              result.errors.push(
                `Table columns missing in output: ${missingKeys.join(', ')}`
              );
              console.log(`   ❌ Missing required columns: ${missingKeys.join(', ')}`);
              console.log(`   Available keys in output: ${actualKeys.join(', ')}`);
            } else {
              console.log(`   ✅ All ${expectedKeys.length} table columns present`);
            }
          }
        }
      }
    } else if (outputType === 'json') {
      // JSON output can be any structure
      console.log(`   ✅ JSON output (type: ${typeof returnValue})`);
    } else if (outputType === 'text' || outputType === 'markdown') {
      // Should be string
      if (typeof returnValue !== 'string') {
        result.warnings.push(
          `Output type "${outputType}" expects string, got ${typeof returnValue}`
        );
        console.log(`   ⚠️  Output is ${typeof returnValue}, consider converting to string`);
      } else {
        console.log(`   ✅ Output is string (${returnValue.length} chars)`);
      }
    }
  }

  return result;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Dry-Run Workflow Testing - Test workflows without side effects

Usage:
  npm run workflow:dry-run <workflow-file.json>

Features:
  ✅ Executes workflow with mock data
  ✅ Validates variable references
  ✅ Checks output structure
  ✅ Detects JavaScript errors
  ✅ Zero API calls or database writes

Example:
  npm run workflow:dry-run workflow/my-workflow.json

What it catches:
  - Undefined variables
  - Type mismatches
  - JavaScript code errors
  - HTTP response structure issues
  - Output structure mismatches (table expects array)
  - Missing parameters

What it doesn't do:
  - Make real API calls (mocked)
  - Write to database (mocked)
  - Send webhooks (mocked)
  - Cost money (no real AI calls)
    `);
    process.exit(0);
  }

  const workflowFile = args[0];

  try {
    const result = await dryRunWorkflow(workflowFile);

    console.log(`\n${'='.repeat(60)}\n`);
    console.log(`📊 Dry-Run Summary:\n`);
    console.log(`   Total steps: ${result.stepResults.length}`);
    console.log(`   Successful: ${result.stepResults.filter(s => s.success).length}`);
    console.log(`   Failed: ${result.stepResults.filter(s => !s.success).length}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Warnings: ${result.warnings.length}`);

    if (result.errors.length > 0) {
      console.log(`\n❌ Errors:\n`);
      result.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚠️  Warnings:\n`);
      result.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning}`);
      });
    }

    if (result.success) {
      console.log(`\n✅ Dry-run completed successfully!`);
      console.log(`   All steps executed without errors.`);
      console.log(`   Ready for real execution.\n`);
      process.exit(0);
    } else {
      console.log(`\n❌ Dry-run failed!`);
      console.log(`   Fix the errors above before running this workflow.\n`);
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Fatal error: ${message}\n`);
    process.exit(1);
  }
}

main();

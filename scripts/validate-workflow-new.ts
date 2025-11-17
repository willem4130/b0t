#!/usr/bin/env tsx
/**
 * Validate Workflow Script (New AJV-based version)
 *
 * Validates a workflow JSON/YAML file using comprehensive JSON Schema validation.
 * Provides detailed, actionable error messages.
 *
 * Usage:
 *   npx tsx scripts/validate-workflow-new.ts <workflow-file.json>
 *   npx tsx scripts/validate-workflow-new.ts <workflow-file.yaml>
 *   npx tsx scripts/validate-workflow-new.ts --stdin < workflow.json
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import YAML from 'yaml';
import { validateWorkflowComplete, formatValidationErrors } from '../src/lib/workflows/workflow-validator';
import type { WorkflowExport } from '../src/lib/workflows/import-export';
import { getModuleRegistry } from '../src/lib/workflows/module-registry';

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
 * Deep validation - actually load modules and verify functions exist + validate parameters
 */
async function validateModuleFunctions(workflow: WorkflowExport): Promise<string[]> {
  const errors: string[] = [];

  for (const step of workflow.config.steps) {
    const [category, moduleName, functionName] = step.module.split('.');

    try {
      // Construct module path
      const modulePath = `../src/modules/${category}/${moduleName}`;

      // Dynamically import the module
      const moduleExports = await import(modulePath);

      // Check if function exists
      if (typeof moduleExports[functionName] !== 'function') {
        errors.push(
          `Step "${step.id}": Function "${functionName}" not found in module ${category}/${moduleName}`
        );

        // Show available functions
        const availableFunctions = Object.keys(moduleExports).filter(
          key => typeof moduleExports[key as keyof typeof moduleExports] === 'function'
        );
        if (availableFunctions.length > 0) {
          errors.push(
            `   Available functions: ${availableFunctions.join(', ')}`
          );
        }
      } else {
        // NEW: Parameter validation
        const moduleInfo = findModuleInRegistry(step.module);
        if (moduleInfo) {
          const providedParams = Object.keys(step.inputs || {});
          const allParams = moduleInfo.signature.match(/\(([^)]*)\)/)?.[1] || '';
          const expectedParamNames = moduleInfo.signature
            .match(/\(([^)]*)\)/)?.[1]
            ?.split(',')
            .map(p => p.trim().split(/[?:]/)[0].trim())
            .filter(p => p && p !== 'params' && p !== 'options') || [];

          // Get required params from registry (if available)
          const requiredParamNames = expectedParamNames.filter(name =>
            !allParams.includes(`${name}?`)
          );

          // If function uses params/options wrapper, skip validation
          // Wrapper functions accept flexible object shapes
          if (allParams.includes('params:') || allParams.includes('params)') ||
              allParams.includes('options:') || allParams.includes('options)')) {
            // Wrapper-based function - skip detailed param validation
            console.log(`   ℹ️  Module uses params/options wrapper - skipping parameter validation for ${step.id}`);
            continue;
          }

          // Check for rest parameters (spread) - NOT supported in workflows
          if (moduleInfo.signature.includes('...')) {
            errors.push(
              `Step "${step.id}": Module "${step.module}" uses rest parameters (...) which are not supported in workflows`
            );
            errors.push(
              `   Signature: ${moduleInfo.signature}`
            );
            errors.push(
              `   💡 Use the array-utils version instead (e.g., utilities.array-utils.max instead of utilities.math.max)`
            );
          }

          // For direct parameter functions, validate
          if (expectedParamNames.length > 0) {
            // Check for missing required params (approximate - we assume all are required unless marked with ?)
            const missingParams = requiredParamNames.filter(p => !providedParams.includes(p));
            if (missingParams.length > 0) {
              errors.push(
                `Step "${step.id}": Parameter mismatch for ${step.module}: Function expects [${expectedParamNames.join(', ')}] but workflow provided [${providedParams.join(', ')}]`
              );
              errors.push(
                `   Missing parameters: ${missingParams.join(', ')}`
              );
              errors.push(
                `   💡 Expected signature: ${moduleInfo.signature}`
              );
            }

            // Check for unexpected params
            const unexpectedParams = providedParams.filter(p =>
              !expectedParamNames.includes(p)
            );
            if (unexpectedParams.length > 0 && missingParams.length === 0) {
              // Only show unexpected if we're not already showing missing
              errors.push(
                `Step "${step.id}": Parameter mismatch for ${step.module}: Function expects [${expectedParamNames.join(', ')}] but workflow provided [${providedParams.join(', ')}]`
              );
              errors.push(
                `   Unexpected parameters: ${unexpectedParams.join(', ')}`
              );
              errors.push(
                `   💡 Expected signature: ${moduleInfo.signature}`
              );
            }

            // NEW: Check for function parameters that are provided as strings
            // Functions like predicate, mapper, fn should be actual functions, not strings
            const functionParamNames = ['predicate', 'mapper', 'fn', 'callback', 'transform', 'comparator'];
            for (const paramName of expectedParamNames) {
              if (functionParamNames.includes(paramName) && step.inputs && paramName in step.inputs) {
                const value = step.inputs[paramName];
                if (typeof value === 'string' && value.includes('=>')) {
                  errors.push(
                    `Step "${step.id}": Type error for ${step.module}.${paramName}: Arrow function provided as string`
                  );
                  errors.push(
                    `   Provided: "${value}" (string)`
                  );
                  errors.push(
                    `   💡 Workflow executor doesn't evaluate JavaScript strings. Remove this step or use a different approach.`
                  );
                  errors.push(
                    `   💡 These parameters require actual function execution which isn't supported in JSON workflows.`
                  );
                }
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      // Module doesn't exist
      const message = error instanceof Error ? error.message : String(error);
      errors.push(
        `Step "${step.id}": Failed to load module ${category}/${moduleName}: ${message}`
      );
    }
  }

  return errors;
}

async function validateWorkflow(workflowContent: string, isYaml: boolean): Promise<void> {
  try {
    console.log('🔍 Validating workflow...\n');

    // Parse JSON or YAML
    let workflow: WorkflowExport;
    try {
      if (isYaml) {
        workflow = YAML.parse(workflowContent) as WorkflowExport;
        console.log('✅ YAML parsed successfully');
      } else {
        // Check for invalid JSON values like undefined (but not in strings like "{{undefinedVariable}}")
        const hasActualUndefined = /:\s*undefined\s*[,\}]/.test(workflowContent) || /\[\s*undefined\s*[,\]]/.test(workflowContent);
        if (hasActualUndefined) {
          console.error('❌ Invalid JSON: Contains "undefined" value (not in quotes)');
          console.error('💡 Tip: Replace undefined with null, or remove the field entirely');
          process.exit(1);
        }
        workflow = JSON.parse(workflowContent);
        console.log('✅ JSON parsed successfully');
      }
    } catch (error) {
      console.error('❌ Invalid format');
      console.error(error);
      process.exit(1);
    }

    // Comprehensive validation using AJV
    console.log('\n🔍 Running comprehensive validation...\n');
    const result = validateWorkflowComplete(workflow);

    if (!result.valid) {
      console.error('❌ Workflow validation failed:\n');
      console.error(formatValidationErrors(result.errors));
      process.exit(1);
    }

    console.log('✅ All validation checks passed');

    // Deep validation - load actual modules and verify functions
    console.log('\n🔍 Deep validation - checking if functions actually exist in modules...');
    const functionErrors = await validateModuleFunctions(workflow);
    if (functionErrors.length > 0) {
      console.error('\n❌ Function validation failed:\n');
      functionErrors.forEach((error) => {
        console.error(`   • ${error}`);
      });
      console.log('\n💡 Tip: The function name in the registry might not match the actual implementation');
      console.log('   Run: npx tsx scripts/generate-module-registry.ts to sync the registry');
      process.exit(1);
    }
    console.log('✅ All functions verified in actual module files');

    // ENHANCED VALIDATION: Trigger configuration
    console.log('\n🔍 Validating trigger configuration...');
    if (workflow.trigger) {
      const trigger = workflow.trigger;

      // Validate cron schedule
      if (trigger.type === 'cron' && trigger.config?.schedule) {
        const schedule = trigger.config.schedule as string;
        const cronRegex = /^(\*|[0-5]?[0-9])\s+(\*|[01]?[0-9]|2[0-3])\s+(\*|[1-2]?[0-9]|3[01])\s+(\*|[1-9]|1[0-2])\s+(\*|[0-6])$/;
        if (!cronRegex.test(schedule)) {
          console.error(`\n❌ Invalid cron schedule: "${schedule}"`);
          console.error('   Expected format: "minute hour day month dayOfWeek"');
          console.error('   Example: "0 * * * *" (every hour)');
          process.exit(1);
        }
        console.log(`   ✅ Cron schedule valid: "${schedule}"`);
      }

      // Validate chat inputVariable
      if ((trigger.type === 'chat' || trigger.type === 'chat-input') && trigger.config?.inputVariable) {
        const inputVar = trigger.config.inputVariable as string;
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(inputVar)) {
          console.error(`\n❌ Invalid inputVariable: "${inputVar}"`);
          console.error('   Must be valid JavaScript identifier');
          process.exit(1);
        }
        console.log(`   ✅ Chat inputVariable valid: "${inputVar}"`);
      }
    }

    // ENHANCED VALIDATION: ReturnValue
    console.log('\n🔍 Validating returnValue...');
    const workflowConfig = workflow.config as { returnValue?: string; steps: Array<{ id: string; outputAs?: string; inputs?: Record<string, unknown> }> };
    if (workflowConfig.returnValue) {
      const varMatch = workflowConfig.returnValue.match(/{{([^}]+)}}/);
      if (varMatch) {
        const varPath = varMatch[1];
        const rootVar = varPath.split('.')[0].split('[')[0];

        // Check if variable is produced by any step
        const producingStep = workflowConfig.steps.find(s => s.outputAs === rootVar);
        if (!producingStep && !['workflowId', 'userId', 'trigger', 'credential'].includes(rootVar)) {
          console.error(`\n❌ ReturnValue references "{{${varPath}}}" but no step produces "${rootVar}"`);
          console.error('   Available outputs:', workflowConfig.steps.filter(s => s.outputAs).map(s => s.outputAs).join(', '));
          process.exit(1);
        }
        console.log(`   ✅ ReturnValue variable "${rootVar}" is produced by step: ${producingStep?.id || 'system'}`);
      }
    } else {
      console.log('   ℹ️  No returnValue specified - will use auto-detection');
    }

    // ENHANCED VALIDATION: Credential analysis
    console.log('\n🔍 Analyzing credential usage...');
    const credentialRefs = new Set<string>();
    for (const step of workflowConfig.steps) {
      const inputStr = JSON.stringify(step.inputs);
      const matches = inputStr.matchAll(/{{credential\.([^}]+)}}/g);
      for (const match of matches) {
        credentialRefs.add(match[1]);
      }
    }

    if (credentialRefs.size > 0) {
      console.log(`   📋 Credentials used: ${[...credentialRefs].join(', ')}`);

      const documented = workflow.metadata?.requiresCredentials || [];
      const undocumented = [...credentialRefs].filter(c => !documented.includes(c));

      if (undocumented.length > 0) {
        console.log(`   ⚠️  Undocumented credentials: ${undocumented.join(', ')}`);
        console.log('   💡 Consider adding to metadata.requiresCredentials');
      } else {
        console.log('   ✅ All credentials documented in metadata');
      }
    } else {
      console.log('   ✅ No credentials required');
    }

    // ENHANCED VALIDATION: Dead code detection
    console.log('\n🔍 Analyzing data flow...');
    const createdVars = new Set(workflowConfig.steps.map(s => s.outputAs).filter(Boolean) as string[]);
    const usedVars = new Set<string>();

    // Check usage in step inputs
    for (const step of workflowConfig.steps) {
      const inputStr = JSON.stringify(step.inputs);
      const matches = inputStr.matchAll(/{{([^}]+)}}/g);
      for (const match of matches) {
        const rootVar = match[1].split('.')[0].split('[')[0];
        if (!rootVar.startsWith('credential') && rootVar !== 'workflowId' && rootVar !== 'userId' && rootVar !== 'trigger') {
          usedVars.add(rootVar);
        }
      }
    }

    // Check usage in returnValue
    if (workflowConfig.returnValue) {
      const returnVarMatch = workflowConfig.returnValue.match(/{{([^}]+)}}/);
      if (returnVarMatch) {
        const rootVar = returnVarMatch[1].split('.')[0].split('[')[0];
        usedVars.add(rootVar);
      }
    }

    const unusedVars = [...createdVars].filter(v => !usedVars.has(v));
    if (unusedVars.length > 0) {
      console.log(`   ⚠️  Unused variables: ${unusedVars.join(', ')}`);
      console.log('   💡 These steps produce output that is never used');
    } else {
      console.log('   ✅ All variables are used');
    }

    // Check for missing returnValue (warning, not error)
    if (!workflowConfig.returnValue && workflow.trigger?.type !== 'chat') {
      console.log('\n⚠️  Missing returnValue - workflow will use auto-detection\n');
      console.log('   Auto-detection filters out internal variables (user, trigger, credentials)');
      console.log('   but it\'s better to explicitly specify what to return.\n');
      console.log('   💡 Recommended: Add returnValue to config:');

      // Suggest based on last step
      const lastStep = workflowConfig.steps[workflowConfig.steps.length - 1];
      if (lastStep.outputAs) {
        console.log(`   📝   "returnValue": "{{${lastStep.outputAs}}}"`);
      } else {
        console.log('   📝   "returnValue": "{{yourVariableName}}"');
      }
    }

    // Summary
    console.log('\n📊 Workflow Summary:');
    console.log(`   Name: ${workflow.name}`);
    console.log(`   Description: ${workflow.description}`);
    console.log(`   Steps: ${workflow.config.steps.length}`);
    console.log(`   Version: ${workflow.version}`);

    if (workflow.trigger) {
      console.log(`   Trigger: ${workflow.trigger.type}`);
    }

    if (workflow.metadata?.category) {
      console.log(`   Category: ${workflow.metadata.category}`);
    }

    if (workflow.metadata?.tags?.length) {
      console.log(`   Tags: ${workflow.metadata.tags.join(', ')}`);
    }

    if (workflow.metadata?.requiresCredentials?.length) {
      console.log(`   Required credentials: ${workflow.metadata.requiresCredentials.join(', ')}`);
    }

    console.log('\n✅ Workflow validation complete!');
    console.log('\n💡 Import with: npx tsx scripts/import-workflow.ts <file>');
  } catch (error) {
    console.error('❌ Validation error:', error);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage:
  npx tsx scripts/validate-workflow-new.ts <workflow-file.json>
  npx tsx scripts/validate-workflow-new.ts <workflow-file.yaml>
  npx tsx scripts/validate-workflow-new.ts --stdin < workflow.json

Options:
  --stdin    Read workflow from stdin
  --help     Show this help message

Features:
  • Comprehensive JSON Schema validation with AJV
  • YAML support in addition to JSON
  • Detailed, actionable error messages
  • Module path and function existence verification
  • Variable reference validation
  • Output display compatibility checks
  `);
  process.exit(0);
}

let workflowContent: string;
let isYaml = false;

if (args[0] === '--stdin') {
  // Read from stdin
  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    workflowContent = Buffer.concat(chunks).toString('utf-8');
    // Try to detect YAML vs JSON
    isYaml = !workflowContent.trim().startsWith('{');
    validateWorkflow(workflowContent, isYaml);
  });
} else {
  // Read from file
  const filePath = resolve(process.cwd(), args[0]);
  isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');

  try {
    workflowContent = readFileSync(filePath, 'utf-8');
    validateWorkflow(workflowContent, isYaml);
  } catch (error) {
    console.error(`❌ Failed to read file: ${filePath}`);
    console.error(error);
    process.exit(1);
  }
}

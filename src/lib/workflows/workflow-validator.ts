/**
 * Workflow Validator using AJV
 *
 * Provides fast, comprehensive validation with detailed error messages
 * that LLMs can understand and fix.
 */

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import ajvKeywords from 'ajv-keywords';
import { workflowSchema, chatInputTriggerSchema, cronTriggerSchema, chatTriggerSchema } from './workflow-schema';
import { getModuleRegistry } from './module-registry';
import { logger } from '@/lib/logger';

// Initialize AJV with strict mode and all features
const ajv = new Ajv({
  allErrors: true, // Return all errors, not just first
  verbose: true, // Include schema and data in errors
  strict: true, // Strict schema validation
  validateFormats: true,
  $data: true // Enable $data references
});

// Add format validators (date-time, email, uri, etc.)
addFormats(ajv);

// Add keywords (transform, uniqueItemProperties, etc.)
ajvKeywords(ajv);

// Compile schemas
const validateWorkflow = ajv.compile(workflowSchema);
const validateChatInputTrigger = ajv.compile(chatInputTriggerSchema);
const validateCronTrigger = ajv.compile(cronTriggerSchema);
const validateChatTrigger = ajv.compile(chatTriggerSchema);

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
  suggestion?: string;
}

/**
 * Format AJV errors into human-readable messages
 */
function formatAjvErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  if (!errors || errors.length === 0) return [];

  return errors.map((error) => {
    const path = error.instancePath || 'root';
    let message = error.message || 'Validation failed';
    let suggestion: string | undefined;

    // Enhance error messages based on keyword
    switch (error.keyword) {
      case 'required':
        message = `Missing required field: ${error.params?.missingProperty}`;
        suggestion = `Add "${error.params?.missingProperty}" to the object`;
        break;
      case 'type':
        message = `Expected type "${error.params?.type}" but got "${typeof error.data}"`;
        suggestion = `Change value to type ${error.params?.type}`;
        break;
      case 'enum':
        message = `Value must be one of: ${error.params?.allowedValues?.join(', ')}`;
        suggestion = `Use one of the allowed values`;
        break;
      case 'pattern':
        message = `Value does not match pattern: ${error.params?.pattern}`;
        if (error.params?.pattern === '^[a-z-]+\\.[a-z-]+\\.[a-zA-Z]+$') {
          suggestion = 'Use format: category.module.function (e.g., "ai.openai.generateText")';
        } else if (error.params?.pattern === '^\\{\\{[^}]+\\}\\}$') {
          suggestion = 'Use format: {{variableName}} (e.g., "{{result}}")';
        }
        break;
      case 'minItems':
        message = `Array must have at least ${error.params?.limit} items`;
        suggestion = 'Add more items to the array';
        break;
      case 'minLength':
        message = `String must be at least ${error.params?.limit} characters`;
        suggestion = 'Use a longer string';
        break;
      case 'maxLength':
        message = `String must be at most ${error.params?.limit} characters`;
        suggestion = 'Use a shorter string';
        break;
      case 'const':
        message = `Value must be exactly: ${error.params?.allowedValue}`;
        suggestion = `Change to "${error.params?.allowedValue}"`;
        break;
    }

    return {
      path,
      message,
      keyword: error.keyword,
      params: error.params,
      suggestion
    };
  });
}

/**
 * Validate workflow structure using JSON Schema
 */
export function validateWorkflowStructure(workflow: unknown): ValidationResult {
  const valid = validateWorkflow(workflow);

  if (!valid) {
    logger.debug({ errors: validateWorkflow.errors }, 'Workflow structure validation failed');
    return {
      valid: false,
      errors: formatAjvErrors(validateWorkflow.errors)
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate trigger configuration
 */
export function validateTrigger(trigger: { type: string; config: Record<string, unknown> }): ValidationResult {
  let triggerValidator: ValidateFunction | null = null;

  switch (trigger.type) {
    case 'chat-input':
      triggerValidator = validateChatInputTrigger;
      break;
    case 'cron':
      triggerValidator = validateCronTrigger;
      break;
    case 'chat':
      triggerValidator = validateChatTrigger;
      break;
    // manual, webhook, telegram, discord don't require specific config
    default:
      return { valid: true, errors: [] };
  }

  const valid = triggerValidator(trigger.config);

  if (!valid) {
    return {
      valid: false,
      errors: formatAjvErrors(triggerValidator.errors)
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate module paths exist in registry
 */
export function validateModulePaths(steps: Array<{ id: string; module: string }>): ValidationResult {
  const errors: ValidationError[] = [];
  const registry = getModuleRegistry();

  // Build map of valid module paths
  const validPaths = new Set<string>();
  registry.forEach((category) => {
    category.modules.forEach((module) => {
      module.functions.forEach((fn) => {
        validPaths.add(`${category.name}.${module.name}.${fn.name}`);
      });
    });
  });

  // Validate each step's module path
  steps.forEach((step) => {
    if (!validPaths.has(step.module)) {
      // Try to find similar modules
      const parts = step.module.split('.');
      const [categoryName, moduleName] = parts;

      const category = registry.find(c => c.name === categoryName);
      let suggestion = 'Check module path format: category.module.function';

      if (!category) {
        const availableCategories = registry.map(c => c.name).join(', ');
        suggestion = `Category "${categoryName}" not found. Available: ${availableCategories}`;
      } else {
        const foundModule = category.modules.find(m => m.name === moduleName);
        if (!foundModule) {
          const availableModules = category.modules.map(m => m.name).join(', ');
          suggestion = `Module "${moduleName}" not found in category "${categoryName}". Available: ${availableModules}`;
        } else {
          const availableFunctions = foundModule.functions.map(f => f.name).join(', ');
          suggestion = `Function not found in ${categoryName}.${moduleName}. Available: ${availableFunctions}`;
        }
      }

      errors.push({
        path: `/config/steps/${step.id}/module`,
        message: `Module path "${step.module}" not found in registry`,
        keyword: 'module-exists',
        suggestion
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate variable references
 */
export function validateVariableReferences(steps: Array<{ id: string; inputs: Record<string, unknown>; outputAs?: string }>): ValidationResult {
  const errors: ValidationError[] = [];
  const declaredVars = new Set<string>(['user', 'trigger', 'credential', 'workflowId']); // Built-in variables

  steps.forEach((step, index) => {
    // Check variable references in inputs
    const inputsStr = JSON.stringify(step.inputs);
    const varRefs = inputsStr.match(/\{\{(\w+)(?:\.\w+)*(?:\[\d+\])*\}\}/g) || [];

    varRefs.forEach((ref) => {
      const varName = ref.match(/\{\{(\w+)/)?.[1];
      if (varName && !declaredVars.has(varName)) {
        errors.push({
          path: `/config/steps/${index}/inputs`,
          message: `Reference to undeclared variable: ${varName}`,
          keyword: 'variable-declared',
          suggestion: `Declare "${varName}" in a previous step using "outputAs", or check for typos`
        });
      }
    });

    // Register this step's output variable
    if (step.outputAs) {
      declaredVars.add(step.outputAs);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate output display configuration matches data type
 */
export function validateOutputDisplay(
  outputDisplay: { type: string; columns?: Array<{ key: string; label: string }> } | undefined,
  lastStep: { id: string; module: string } | undefined
): ValidationResult {
  if (!outputDisplay || !lastStep) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = [];

  // Check table display has columns
  if (outputDisplay.type === 'table' && (!outputDisplay.columns || outputDisplay.columns.length === 0)) {
    errors.push({
      path: '/config/outputDisplay/columns',
      message: 'Table display requires columns array',
      keyword: 'table-columns',
      suggestion: 'Add columns array with at least one column definition'
    });
  }

  // Warn about potential type mismatches
  const singleValueModules = ['average', 'sum', 'count', 'min', 'max', 'hashSHA256', 'generateUUID', 'now', 'toISO'];
  if (outputDisplay.type === 'table' && singleValueModules.some(mod => lastStep.module.includes(mod))) {
    errors.push({
      path: '/config/outputDisplay/type',
      message: `Last step likely returns single value, but output display is "table" (expects array)`,
      keyword: 'output-type-mismatch',
      suggestion: 'Change outputDisplay.type to "text" or "json", or ensure last step returns an array'
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate AI SDK usage
 */
function validateAISDK(steps: Array<{ id: string; module: string; inputs: Record<string, unknown> }>): ValidationError[] {
  const errors: ValidationError[] = [];
  const aiSDKModules = [
    'ai.ai-sdk.generateText',
    'ai.ai-sdk.generateJSON',
    'ai.ai-sdk.chat',
    'ai.ai-sdk.streamText'
  ];

  steps.forEach((step, index) => {
    if (!aiSDKModules.includes(step.module)) return;

    const inputs = step.inputs as Record<string, unknown>;
    const options = inputs.options as Record<string, unknown> | undefined;

    // Check if options wrapper exists
    if (!options) {
      errors.push({
        path: `/config/steps/${index}/inputs`,
        message: 'AI SDK functions require "options" wrapper',
        keyword: 'missing-options-wrapper',
        suggestion: 'Wrap parameters in "options": { ... }. Example: "inputs": { "options": { "prompt": "...", "model": "gpt-4o-mini", "apiKey": "{{credential.openai_api_key}}" } }'
      });
      return;
    }

    // Check for required apiKey field (critical for execution)
    if (!options.apiKey) {
      errors.push({
        path: `/config/steps/${index}/inputs/options`,
        message: 'AI SDK requires explicit "apiKey" parameter',
        keyword: 'missing-apiKey',
        suggestion: 'Add "apiKey": "{{credential.openai_api_key}}" or "{{credential.anthropic_api_key}}" inside options'
      });
    }

    // Check for model field
    if (!options.model) {
      errors.push({
        path: `/config/steps/${index}/inputs/options`,
        message: 'AI SDK requires "model" parameter',
        keyword: 'missing-model',
        suggestion: 'Add "model": "gpt-4o-mini" or "claude-haiku-4-5-20251001" inside options'
      });
    }

    // Check for prompt field
    if (!options.prompt && !options.messages) {
      errors.push({
        path: `/config/steps/${index}/inputs/options`,
        message: 'AI SDK requires either "prompt" or "messages" parameter',
        keyword: 'missing-prompt',
        suggestion: 'Add "prompt": "Your prompt here" or "messages": [...] inside options'
      });
    }
  });

  return errors;
}

/**
 * Validate workflow storage usage
 */
function validateWorkflowStorage(steps: Array<{ id: string; module: string; inputs: Record<string, unknown> }>): ValidationError[] {
  const errors: ValidationError[] = [];
  const storageModules = [
    'data.drizzle-utils.insertRecord',
    'data.drizzle-utils.queryWhereIn',
    'data.drizzle-utils.queryRecords',
    'data.drizzle-utils.updateRecord',
    'data.drizzle-utils.deleteRecord'
  ];

  steps.forEach((step, index) => {
    if (!storageModules.includes(step.module)) return;

    const inputs = step.inputs as Record<string, unknown>;
    const params = inputs.params as Record<string, unknown> | undefined;

    // Check if params wrapper is used (required for drizzle-utils)
    if (!params) {
      errors.push({
        path: `/config/steps/${index}/inputs`,
        message: 'data.drizzle-utils functions require "params" wrapper',
        keyword: 'missing-params-wrapper',
        suggestion: 'Wrap parameters in "params": { ... }. Example: "inputs": { "params": { "workflowId": "{{workflowId}}", "tableName": "...", ... } }'
      });
      // Skip further validation if no params wrapper
      return;
    }

    // Check if workflowId is provided for workflow-scoped storage
    if (!params.workflowId) {
      errors.push({
        path: `/config/steps/${index}/inputs/params`,
        message: 'Workflow storage module used without workflowId parameter',
        keyword: 'missing-workflowId',
        suggestion: 'Add "workflowId": "{{workflowId}}" inside params for automatic table namespacing and isolation. This prevents conflicts between workflows.'
      });
    }

    // Validate workflowId format (should be {{workflowId}})
    const workflowId = params.workflowId;
    if (workflowId && typeof workflowId === 'string') {
      if (!workflowId.includes('{{workflowId}}')) {
        errors.push({
          path: `/config/steps/${index}/inputs/params/workflowId`,
          message: 'workflowId should use variable reference {{workflowId}} not a hardcoded value',
          keyword: 'invalid-workflowId',
          suggestion: 'Change to "workflowId": "{{workflowId}}" to use the current workflow\'s ID'
        });
      }
    }

    // Check tableName is provided
    if (!params.tableName) {
      errors.push({
        path: `/config/steps/${index}/inputs/params`,
        message: 'tableName parameter is required for workflow storage',
        keyword: 'missing-tableName',
        suggestion: 'Add "tableName": "your_table_name" inside params (e.g., "replied_tweets", "processed_items")'
      });
    }

    // Validate expiresInDays is a reasonable number
    const expiresInDays = params.expiresInDays;
    if (expiresInDays !== undefined) {
      if (typeof expiresInDays !== 'number' || expiresInDays < 1 || expiresInDays > 365) {
        errors.push({
          path: `/config/steps/${index}/inputs/params/expiresInDays`,
          message: 'expiresInDays must be a number between 1 and 365',
          keyword: 'invalid-expiresInDays',
          suggestion: 'Common values: 7 (one week), 30 (one month), 90 (three months)'
        });
      }
    }

    // Validate specific function requirements
    if (step.module === 'data.drizzle-utils.insertRecord' && !params.data) {
      errors.push({
        path: `/config/steps/${index}/inputs/params`,
        message: 'insertRecord requires "data" parameter with fields to insert',
        keyword: 'missing-data',
        suggestion: 'Add "data": { "field1": "value1", "field2": "value2", ... } inside params'
      });
    }

    if (step.module === 'data.drizzle-utils.queryWhereIn') {
      if (!params.column) {
        errors.push({
          path: `/config/steps/${index}/inputs/params`,
          message: 'queryWhereIn requires "column" parameter',
          keyword: 'missing-column',
          suggestion: 'Add "column": "field_name" (e.g., "tweet_id", "item_id") inside params'
        });
      }
      if (!params.values) {
        errors.push({
          path: `/config/steps/${index}/inputs/params`,
          message: 'queryWhereIn requires "values" parameter (array to check)',
          keyword: 'missing-values',
          suggestion: 'Add "values": "{{arrayVariable}}" inside params'
        });
      }
    }
  });

  return errors;
}

/**
 * Comprehensive workflow validation
 */
export function validateWorkflowComplete(workflow: unknown): ValidationResult {
  // First validate structure
  const structureResult = validateWorkflowStructure(workflow);
  if (!structureResult.valid) {
    return structureResult;
  }

  const w = workflow as {
    trigger?: { type: string; config: Record<string, unknown> };
    config: {
      steps: Array<{ id: string; module: string; inputs: Record<string, unknown>; outputAs?: string }>;
      outputDisplay?: { type: string; columns?: Array<{ key: string; label: string }> };
    };
  };

  const allErrors: ValidationError[] = [];

  // Validate trigger config
  if (w.trigger) {
    const triggerResult = validateTrigger(w.trigger);
    allErrors.push(...triggerResult.errors);
  }

  // Validate AI SDK usage
  const aiSDKErrors = validateAISDK(w.config.steps);
  allErrors.push(...aiSDKErrors);

  // Validate workflow storage usage
  const storageErrors = validateWorkflowStorage(w.config.steps);
  allErrors.push(...storageErrors);

  // Validate module paths
  const moduleResult = validateModulePaths(w.config.steps);
  allErrors.push(...moduleResult.errors);

  // Validate variable references
  const varResult = validateVariableReferences(w.config.steps);
  allErrors.push(...varResult.errors);

  // Validate output display
  const lastStep = w.config.steps[w.config.steps.length - 1];
  const outputResult = validateOutputDisplay(w.config.outputDisplay, lastStep);
  allErrors.push(...outputResult.errors);

  return {
    valid: allErrors.length === 0,
    errors: allErrors
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  let output = 'Validation Errors:\n\n';

  errors.forEach((error, index) => {
    output += `${index + 1}. ${error.path}\n`;
    output += `   ${error.message}\n`;
    if (error.suggestion) {
      output += `   💡 ${error.suggestion}\n`;
    }
    output += '\n';
  });

  return output;
}

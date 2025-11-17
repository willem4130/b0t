import { logger } from '@/lib/logger';

/**
 * Workflow Import/Export
 *
 * Share workflows with others via JSON files.
 * Similar to Docker Compose or GitHub Actions - portable workflow definitions.
 */

export interface WorkflowExport {
  version: string; // Schema version for future compatibility
  name: string;
  description: string;
  trigger?: {
    type: 'manual' | 'cron' | 'webhook' | 'telegram' | 'discord' | 'chat' | 'chat-input' | 'gmail' | 'outlook';
    config: Record<string, unknown>;
  };
  config: {
    timeout?: number;
    retries?: number;
    steps: Array<{
      id: string;
      module: string;
      inputs: Record<string, unknown>;
      outputAs?: string;
    }>;
    returnValue?: string;
    outputDisplay?: {
      type: 'table' | 'list' | 'text' | 'markdown' | 'json' | 'image' | 'images' | 'chart';
      columns?: Array<{
        key: string;
        label: string;
        type?: 'text' | 'link' | 'date' | 'number' | 'boolean';
      }>;
    };
  };
  metadata?: {
    author?: string;
    created?: string;
    tags?: string[];
    category?: string;
    requiresCredentials?: string[]; // e.g., ['openai', 'stripe']
  };
}

/**
 * Export a workflow to a shareable JSON format
 */
export function exportWorkflow(
  name: string,
  description: string,
  config: {
    timeout?: number;
    retries?: number;
    steps: Array<{
      id: string;
      module: string;
      inputs: Record<string, unknown>;
      outputAs?: string;
    }>;
    returnValue?: string;
    outputDisplay?: {
      type: 'table' | 'list' | 'text' | 'markdown' | 'json' | 'image' | 'images' | 'chart';
      columns?: Array<{
        key: string;
        label: string;
        type?: 'text' | 'link' | 'date' | 'number' | 'boolean';
      }>;
    };
  },
  metadata?: {
    author?: string;
    tags?: string[];
    category?: string;
    requiresCredentials?: string[];
  }
): WorkflowExport {
  logger.info({ name }, 'Exporting workflow');

  const exportData: WorkflowExport = {
    version: '1.0',
    name,
    description,
    config,
    metadata: {
      ...metadata,
      created: new Date().toISOString(),
    },
  };

  return exportData;
}

/**
 * Export workflow to JSON string
 */
export function exportWorkflowToJSON(
  name: string,
  description: string,
  config: {
    steps: Array<{
      id: string;
      module: string;
      inputs: Record<string, unknown>;
      outputAs?: string;
    }>;
    returnValue?: string;
    outputDisplay?: {
      type: 'table' | 'list' | 'text' | 'markdown' | 'json' | 'image' | 'images' | 'chart';
      columns?: Array<{
        key: string;
        label: string;
        type?: 'text' | 'link' | 'date' | 'number' | 'boolean';
      }>;
    };
  },
  metadata?: {
    author?: string;
    tags?: string[];
    category?: string;
    requiresCredentials?: string[];
  }
): string {
  const exportData = exportWorkflow(name, description, config, metadata);
  return JSON.stringify(exportData, null, 2);
}

/**
 * Import a workflow from JSON
 */
export function importWorkflow(jsonData: string): WorkflowExport {
  logger.info('Importing workflow from JSON');

  try {
    const workflow = JSON.parse(jsonData) as WorkflowExport;

    // Validate required fields
    if (!workflow.version) {
      throw new Error('Missing version field in workflow');
    }

    if (!workflow.name) {
      throw new Error('Missing name field in workflow');
    }

    if (!workflow.description) {
      throw new Error('Missing description field in workflow');
    }

    if (!workflow.config || !workflow.config.steps) {
      throw new Error('Missing config.steps in workflow');
    }

    // Validate version compatibility
    if (workflow.version !== '1.0') {
      logger.warn(
        { version: workflow.version },
        'Workflow version may not be fully compatible'
      );
    }

    // Validate steps
    for (const step of workflow.config.steps) {
      if (!step.id) {
        throw new Error('Step missing id field');
      }
      if (!step.module) {
        throw new Error(`Step ${step.id} missing module field`);
      }
      if (!step.inputs || typeof step.inputs !== 'object') {
        throw new Error(`Step ${step.id} missing or invalid inputs field`);
      }

      // Validate module path format (category.module.function)
      const parts = step.module.split('.');
      if (parts.length !== 3) {
        throw new Error(
          `Step ${step.id} has invalid module path: ${step.module}. Expected format: category.module.function`
        );
      }
    }

    // Validate output configuration (comprehensive validation)
    const validation = validateWorkflowExport(workflow);
    if (!validation.valid) {
      throw new Error(
        `Workflow validation failed:\n${validation.errors.map(e => `  - ${e}`).join('\n')}`
      );
    }

    logger.info(
      { name: workflow.name, stepCount: workflow.config.steps.length },
      'Workflow imported successfully'
    );

    return workflow;
  } catch (error) {
    logger.error({ error }, 'Failed to import workflow');
    throw new Error(
      `Failed to import workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate workflow export format
 */
export function validateWorkflowExport(workflow: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!workflow || typeof workflow !== 'object') {
    return { valid: false, errors: ['Workflow must be an object'] };
  }

  const w = workflow as Record<string, unknown>;

  if (!w.version || typeof w.version !== 'string') {
    errors.push('Missing or invalid version field');
  }

  if (!w.name || typeof w.name !== 'string') {
    errors.push('Missing or invalid name field');
  }

  if (!w.description || typeof w.description !== 'string') {
    errors.push('Missing or invalid description field');
  }

  if (!w.config || typeof w.config !== 'object') {
    errors.push('Missing or invalid config field');
  } else {
    const config = w.config as Record<string, unknown>;
    if (!Array.isArray(config.steps)) {
      errors.push('config.steps must be an array');
    } else {
      config.steps.forEach((step: unknown, index: number) => {
        if (!step || typeof step !== 'object') {
          errors.push(`Step ${index} must be an object`);
          return;
        }

        const s = step as Record<string, unknown>;
        if (!s.id) errors.push(`Step ${index} missing id field`);
        if (!s.module) errors.push(`Step ${index} missing module field`);
        if (!s.inputs || typeof s.inputs !== 'object') {
          errors.push(`Step ${index} missing or invalid inputs field`);
        }

        if (s.module && typeof s.module === 'string') {
          const parts = s.module.split('.');
          if (parts.length !== 3) {
            errors.push(
              `Step ${index} has invalid module path: ${s.module}. Expected: category.module.function`
            );
          }
        }
      });
    }

    // Validate output configuration
    if (config.outputDisplay) {
      if (typeof config.outputDisplay !== 'object') {
        errors.push('config.outputDisplay must be an object');
      } else {
        const output = config.outputDisplay as Record<string, unknown>;

        // Validate type
        if (!output.type) {
          errors.push('config.outputDisplay missing required field: type');
        } else if (typeof output.type !== 'string') {
          errors.push('config.outputDisplay.type must be a string');
        } else {
          const validTypes = ['table', 'list', 'text', 'markdown', 'json', 'image', 'images', 'chart'];
          if (!validTypes.includes(output.type as string)) {
            errors.push(`config.outputDisplay.type must be one of: ${validTypes.join(', ')}. Got: ${output.type}`);
          }

          // Validate table-specific configuration
          if (output.type === 'table') {
            if (!output.columns) {
              errors.push('config.outputDisplay.type "table" requires columns array');
            } else if (!Array.isArray(output.columns)) {
              errors.push('config.outputDisplay.columns must be an array');
            } else if (output.columns.length === 0) {
              errors.push('config.outputDisplay.columns cannot be empty for table display');
            } else {
              (output.columns as unknown[]).forEach((col: unknown, idx: number) => {
                if (!col || typeof col !== 'object') {
                  errors.push(`config.outputDisplay.columns[${idx}] must be an object`);
                  return;
                }
                const column = col as Record<string, unknown>;
                if (!column.key || typeof column.key !== 'string') {
                  errors.push(`config.outputDisplay.columns[${idx}] missing required field: key (string)`);
                }
                if (!column.label || typeof column.label !== 'string') {
                  errors.push(`config.outputDisplay.columns[${idx}] missing required field: label (string)`);
                }
                if (column.type && typeof column.type === 'string') {
                  const validColumnTypes = ['text', 'link', 'date', 'number', 'boolean'];
                  if (!validColumnTypes.includes(column.type as string)) {
                    errors.push(`config.outputDisplay.columns[${idx}].type must be one of: ${validColumnTypes.join(', ')}. Got: ${column.type}`);
                  }
                }
              });
            }
          }
        }
      }
    }

    // Validate returnValue if specified
    if (config.returnValue !== undefined) {
      if (typeof config.returnValue !== 'string') {
        errors.push('config.returnValue must be a string (e.g., "{{variableName}}")');
      } else if (!/^\{\{[^}]+\}\}$/.test(config.returnValue as string)) {
        errors.push(`config.returnValue must be in format {{variableName}}. Got: ${config.returnValue}`);
      } else {
        // Check if returnValue references a valid step output
        const varName = (config.returnValue as string).match(/^\{\{([^}]+)\}\}$/)?.[1];
        if (varName && Array.isArray(config.steps)) {
          const stepOutputs = config.steps.map((s: unknown) => {
            const step = s as Record<string, unknown>;
            return step.outputAs as string;
          }).filter(Boolean);

          // Extract base variable name (before any dot notation)
          const baseVar = varName.split('.')[0].split('[')[0];

          if (!stepOutputs.includes(baseVar)) {
            errors.push(`config.returnValue references unknown variable: ${baseVar}. Available: ${stepOutputs.join(', ')}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract required credentials from workflow
 */
export function extractRequiredCredentials(workflow: WorkflowExport): string[] {
  const credentials = new Set<string>();

  // Check metadata first
  if (workflow.metadata?.requiresCredentials) {
    workflow.metadata.requiresCredentials.forEach((cred) => credentials.add(cred));
  }

  // Scan steps for {{user.platform}} references
  for (const step of workflow.config.steps) {
    const inputsStr = JSON.stringify(step.inputs);
    const matches = inputsStr.match(/\{\{user\.(\w+)\}\}/g);
    if (matches) {
      matches.forEach((match) => {
        const platform = match.match(/\{\{user\.(\w+)\}\}/)?.[1];
        if (platform) credentials.add(platform);
      });
    }
  }

  return Array.from(credentials);
}

/**
 * Generate workflow file name (safe for file system)
 */
export function generateWorkflowFileName(workflowName: string): string {
  return (
    workflowName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '.workflow.json'
  );
}

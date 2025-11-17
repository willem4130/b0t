/**
 * Workflow Patching with JSON Patch (RFC 6902)
 *
 * Enables incremental workflow updates without regenerating entire workflow.
 * LLMs can generate patches instead of rewriting workflows.
 */

import { applyPatch, Operation, validate } from 'fast-json-patch';
import { logger } from '@/lib/logger';
import type { WorkflowExport } from './import-export';

export interface PatchResult {
  success: boolean;
  workflow?: WorkflowExport;
  error?: string;
  appliedOps?: number;
}

/**
 * Apply JSON Patch operations to a workflow
 *
 * @example
 * const patch = [
 *   { op: 'add', path: '/config/steps/-', value: newStep },
 *   { op: 'replace', path: '/description', value: 'Updated description' }
 * ];
 * const result = applyWorkflowPatch(workflow, patch);
 */
export function applyWorkflowPatch(
  workflow: WorkflowExport,
  operations: Operation[]
): PatchResult {
  try {
    // Validate patch format
    const errors = validate(operations, workflow);
    if (errors) {
      logger.error({ errors }, 'Invalid JSON Patch operations');
      return {
        success: false,
        error: `Invalid patch: ${errors.name} - ${errors.message}`
      };
    }

    // Clone workflow to avoid mutations
    const workflowCopy = JSON.parse(JSON.stringify(workflow)) as WorkflowExport;

    // Apply patch
    const result = applyPatch(workflowCopy, operations, true, false);

    if (result.some(r => r !== null && typeof r === 'object' && 'rejected' in r)) {
      const rejected = result.filter(r => r !== null && typeof r === 'object' && 'rejected' in r);
      logger.error({ rejected }, 'Some patch operations were rejected');
      return {
        success: false,
        error: `Failed to apply ${rejected.length} operation(s)`
      };
    }

    logger.info(
      { operationCount: operations.length },
      'Successfully applied workflow patch'
    );

    return {
      success: true,
      workflow: workflowCopy,
      appliedOps: operations.length
    };
  } catch (error) {
    logger.error({ error }, 'Failed to apply workflow patch');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Common patch operations for workflows
 */
export const WorkflowPatchOperations = {
  /**
   * Add a new step at the end
   */
  addStep(step: {
    id: string;
    module: string;
    inputs: Record<string, unknown>;
    outputAs?: string;
  }): Operation {
    return {
      op: 'add',
      path: '/config/steps/-',
      value: step
    };
  },

  /**
   * Add a new step at specific index
   */
  addStepAt(
    index: number,
    step: {
      id: string;
      module: string;
      inputs: Record<string, unknown>;
      outputAs?: string;
    }
  ): Operation {
    return {
      op: 'add',
      path: `/config/steps/${index}`,
      value: step
    };
  },

  /**
   * Remove a step by index
   */
  removeStep(index: number): Operation {
    return {
      op: 'remove',
      path: `/config/steps/${index}`
    };
  },

  /**
   * Update step inputs
   */
  updateStepInputs(
    stepIndex: number,
    inputs: Record<string, unknown>
  ): Operation {
    return {
      op: 'replace',
      path: `/config/steps/${stepIndex}/inputs`,
      value: inputs
    };
  },

  /**
   * Update step module
   */
  updateStepModule(stepIndex: number, module: string): Operation {
    return {
      op: 'replace',
      path: `/config/steps/${stepIndex}/module`,
      value: module
    };
  },

  /**
   * Update workflow description
   */
  updateDescription(description: string): Operation {
    return {
      op: 'replace',
      path: '/description',
      value: description
    };
  },

  /**
   * Update workflow name
   */
  updateName(name: string): Operation {
    return {
      op: 'replace',
      path: '/name',
      value: name
    };
  },

  /**
   * Set returnValue
   */
  setReturnValue(returnValue: string): Operation {
    return {
      op: 'add',
      path: '/config/returnValue',
      value: returnValue
    };
  },

  /**
   * Set output display configuration
   */
  setOutputDisplay(outputDisplay: {
    type: 'table' | 'list' | 'text' | 'markdown' | 'json' | 'image' | 'images' | 'chart';
    columns?: Array<{ key: string; label: string; type?: string }>;
  }): Operation {
    return {
      op: 'add',
      path: '/config/outputDisplay',
      value: outputDisplay
    };
  },

  /**
   * Add a tag
   */
  addTag(tag: string): Operation {
    return {
      op: 'add',
      path: '/metadata/tags/-',
      value: tag
    };
  },

  /**
   * Set trigger configuration
   */
  setTrigger(trigger: {
    type: 'manual' | 'cron' | 'webhook' | 'telegram' | 'discord' | 'chat' | 'chat-input';
    config: Record<string, unknown>;
  }): Operation {
    return {
      op: 'add',
      path: '/trigger',
      value: trigger
    };
  }
};

/**
 * Find step index by ID
 */
export function findStepIndex(workflow: WorkflowExport, stepId: string): number {
  return workflow.config.steps.findIndex(step => step.id === stepId);
}

/**
 * Generate patch to replace a step by ID
 */
export function replaceStepById(
  workflow: WorkflowExport,
  stepId: string,
  newStep: {
    id: string;
    module: string;
    inputs: Record<string, unknown>;
    outputAs?: string;
  }
): Operation | null {
  const index = findStepIndex(workflow, stepId);
  if (index === -1) return null;

  return {
    op: 'replace',
    path: `/config/steps/${index}`,
    value: newStep
  };
}

/**
 * Generate patch to remove a step by ID
 */
export function removeStepById(workflow: WorkflowExport, stepId: string): Operation | null {
  const index = findStepIndex(workflow, stepId);
  if (index === -1) return null;

  return WorkflowPatchOperations.removeStep(index);
}

import { logger } from '@/lib/logger';
import { ExecutionContext } from './executor';

/**
 * Control Flow for Workflows
 *
 * Adds conditional logic (if/else) and loops (forEach, while) to workflows.
 * Steps can now have types: 'action', 'condition', 'loop'
 */

export type WorkflowStep =
  | ActionStep
  | ConditionStep
  | ForEachStep
  | WhileStep;

export interface ActionStep {
  type: 'action';
  id: string;
  module: string;
  inputs: Record<string, unknown>;
  outputAs?: string;
}

export interface ConditionStep {
  type: 'condition';
  id: string;
  condition: string; // Expression like "{{variable}} === 'value'"
  then: WorkflowStep[]; // Steps to execute if true
  else?: WorkflowStep[]; // Steps to execute if false
}

export interface ForEachStep {
  type: 'forEach';
  id: string;
  array: string; // Variable reference like "{{items}}"
  itemAs: string; // Variable name for current item (e.g., "item")
  indexAs?: string; // Variable name for index (e.g., "index")
  steps: WorkflowStep[]; // Steps to execute for each item
}

export interface WhileStep {
  type: 'while';
  id: string;
  condition: string; // Expression to evaluate
  maxIterations?: number; // Safety limit (default: 100)
  steps: WorkflowStep[]; // Steps to execute while condition is true
}

/**
 * Evaluate a condition expression
 * Supports: ===, !==, >, <, >=, <=, &&, ||
 */
export function evaluateCondition(
  condition: string,
  variables: Record<string, unknown>
): boolean {
  logger.debug({ condition, variables }, 'Evaluating condition');

  try {
    // Replace {{variable}} with actual values
    let expr = condition;
    const matches = expr.match(/\{\{(.+?)\}\}/g);

    if (matches) {
      for (const match of matches) {
        const path = match.slice(2, -2); // Remove {{ and }}
        const value = getNestedValue(variables, path);

        // Serialize the value properly
        const serialized = typeof value === 'string'
          ? `"${value}"`
          : JSON.stringify(value);

        expr = expr.replace(match, serialized);
      }
    }

    logger.debug({ originalCondition: condition, evaluatedExpression: expr }, 'Condition evaluation');

    // Safe evaluation using Function constructor (only for boolean expressions)
    const result = new Function(`return ${expr}`)();

    return Boolean(result);
  } catch (error) {
    logger.error({ error, condition }, 'Failed to evaluate condition');
    throw new Error(
      `Failed to evaluate condition "${condition}": ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(/\.|\[|\]/).filter(Boolean);
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Resolve array reference for loops
 */
export function resolveArrayReference(
  arrayRef: string,
  variables: Record<string, unknown>
): unknown[] {
  // Handle {{variable}} syntax
  const match = arrayRef.match(/^\{\{(.+)\}\}$/);
  if (!match) {
    throw new Error(`Invalid array reference: ${arrayRef}. Expected {{variableName}}`);
  }

  const path = match[1];
  const value = getNestedValue(variables, path);

  if (!Array.isArray(value)) {
    throw new Error(
      `Array reference ${arrayRef} did not resolve to an array. Got: ${typeof value}`
    );
  }

  return value;
}

/**
 * Check if a step is a control flow step
 */
export function isControlFlowStep(step: WorkflowStep | ActionStep): step is ConditionStep | ForEachStep | WhileStep {
  return step.type === 'condition' || step.type === 'forEach' || step.type === 'while';
}

/**
 * Check if a step is an action step
 */
export function isActionStep(step: WorkflowStep | ActionStep): step is ActionStep {
  return step.type === 'action' || !('type' in step);
}

/**
 * Normalize legacy steps (without type field) to ActionStep
 */
export function normalizeStep(step: unknown): WorkflowStep {
  const s = step as Record<string, unknown>;

  // If already has a type, return as-is
  if (s.type) {
    return step as WorkflowStep;
  }

  // Legacy format - assume it's an action step
  return {
    type: 'action',
    ...s,
  } as ActionStep;
}

/**
 * Execute a single workflow step (with control flow support)
 */
export async function executeStep(
  step: WorkflowStep,
  context: ExecutionContext,
  executeModuleFn: (module: string, inputs: Record<string, unknown>) => Promise<unknown>,
  resolveVariablesFn: (inputs: Record<string, unknown>, variables: Record<string, unknown>) => Record<string, unknown>
): Promise<unknown> {
  const normalizedStep = normalizeStep(step);

  try {
    if (normalizedStep.type === 'condition') {
      return await executeConditionStep(normalizedStep, context, executeModuleFn, resolveVariablesFn);
    }

    if (normalizedStep.type === 'forEach') {
      return await executeForEachStep(normalizedStep, context, executeModuleFn, resolveVariablesFn);
    }

    if (normalizedStep.type === 'while') {
      return await executeWhileStep(normalizedStep, context, executeModuleFn, resolveVariablesFn);
    }

    // Action step
    return await executeActionStep(normalizedStep, context, executeModuleFn, resolveVariablesFn);
  } catch (error) {
    // Add step context to error message
    const stepInfo = `Step "${step.id}"${normalizedStep.type === 'action' && 'module' in normalizedStep ? ` (${normalizedStep.module})` : ''}`;
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      stepId: step.id,
      stepType: normalizedStep.type,
      error: errorMsg,
    }, `Error in ${stepInfo}`);

    throw new Error(`${stepInfo}: ${errorMsg}`);
  }
}

/**
 * Execute an action step
 */
async function executeActionStep(
  step: ActionStep,
  context: ExecutionContext,
  executeModuleFn: (module: string, inputs: Record<string, unknown>) => Promise<unknown>,
  resolveVariablesFn: (inputs: Record<string, unknown>, variables: Record<string, unknown>) => Record<string, unknown>
): Promise<unknown> {
  logger.info({ stepId: step.id, module: step.module }, 'Executing action step');

  const resolvedInputs = resolveVariablesFn(step.inputs, context.variables);

  // SYSTEM PROMPT OVERRIDE: If this is an AI module and systemPrompt is set in workflow config,
  // override the resolved inputs with the UI-set system prompt
  const isAIModule = step.module.startsWith('ai.') ||
                     step.module.toLowerCase().includes('openai') ||
                     step.module.toLowerCase().includes('anthropic');

  logger.info(
    {
      stepId: step.id,
      module: step.module,
      isAIModule,
      hasContext: !!context,
      hasConfig: !!context.config,
      configStepsCount: context.config?.steps?.length || 0
    },
    'DEBUG: Checking for system prompt override'
  );

  if (isAIModule && context.config) {
    const configStep = context.config.steps.find(s => s.id === step.id);

    // Check for systemPrompt in both flat and nested structures
    const configOptions = configStep?.inputs?.options as Record<string, unknown> | undefined;
    const systemPrompt = configOptions?.systemPrompt || configStep?.inputs?.systemPrompt;

    logger.info(
      {
        stepId: step.id,
        foundConfigStep: !!configStep,
        configStepInputs: configStep?.inputs ? Object.keys(configStep.inputs) : [],
        hasOptionsNesting: !!configOptions,
        hasSystemPrompt: !!systemPrompt,
        systemPromptSource: configOptions?.systemPrompt ? 'options.systemPrompt' :
                           configStep?.inputs?.systemPrompt ? 'inputs.systemPrompt' : 'none'
      },
      'DEBUG: Config step lookup result'
    );

    if (systemPrompt) {
      // UI-set system prompt takes absolute priority
      // Check if inputs are nested under 'options' (common pattern for AI modules)
      if (resolvedInputs.options && typeof resolvedInputs.options === 'object') {
        (resolvedInputs.options as Record<string, unknown>).systemPrompt = systemPrompt;
      } else {
        resolvedInputs.systemPrompt = systemPrompt;
      }
      logger.info(
        { stepId: step.id, module: step.module, systemPromptLength: String(systemPrompt).length },
        'Overriding system prompt with UI-configured value'
      );
    }
  }

  const output = await executeModuleFn(step.module, resolvedInputs);

  if (step.outputAs) {
    context.variables[step.outputAs] = output;
  }

  return output;
}

/**
 * Execute a condition step (if/else)
 */
async function executeConditionStep(
  step: ConditionStep,
  context: ExecutionContext,
  executeModuleFn: (module: string, inputs: Record<string, unknown>) => Promise<unknown>,
  resolveVariablesFn: (inputs: Record<string, unknown>, variables: Record<string, unknown>) => Record<string, unknown>
): Promise<unknown> {
  logger.info({ stepId: step.id, condition: step.condition }, 'Executing condition step');

  const conditionResult = evaluateCondition(step.condition, context.variables);
  const branchSteps = conditionResult ? step.then : (step.else || []);

  logger.info({ stepId: step.id, conditionResult, branchCount: branchSteps.length }, 'Condition evaluated');

  let lastOutput: unknown = null;

  for (const branchStep of branchSteps) {
    lastOutput = await executeStep(branchStep, context, executeModuleFn, resolveVariablesFn);
  }

  return lastOutput;
}

/**
 * Execute a forEach loop
 */
async function executeForEachStep(
  step: ForEachStep,
  context: ExecutionContext,
  executeModuleFn: (module: string, inputs: Record<string, unknown>) => Promise<unknown>,
  resolveVariablesFn: (inputs: Record<string, unknown>, variables: Record<string, unknown>) => Record<string, unknown>
): Promise<unknown> {
  logger.info({ stepId: step.id, arrayRef: step.array }, 'Executing forEach loop');

  const array = resolveArrayReference(step.array, context.variables);
  const results: unknown[] = [];

  for (let i = 0; i < array.length; i++) {
    const item = array[i];

    // Set loop variables
    context.variables[step.itemAs] = item;
    if (step.indexAs) {
      context.variables[step.indexAs] = i;
    }

    logger.debug({ stepId: step.id, index: i, itemAs: step.itemAs }, 'Loop iteration');

    // Execute loop body
    for (const loopStep of step.steps) {
      const output = await executeStep(loopStep, context, executeModuleFn, resolveVariablesFn);
      results.push(output);
    }
  }

  return results;
}

/**
 * Execute a while loop
 */
async function executeWhileStep(
  step: WhileStep,
  context: ExecutionContext,
  executeModuleFn: (module: string, inputs: Record<string, unknown>) => Promise<unknown>,
  resolveVariablesFn: (inputs: Record<string, unknown>, variables: Record<string, unknown>) => Record<string, unknown>
): Promise<unknown> {
  logger.info({ stepId: step.id, condition: step.condition }, 'Executing while loop');

  const maxIterations = step.maxIterations || 100;
  let iteration = 0;
  let lastOutput: unknown = null;

  while (evaluateCondition(step.condition, context.variables)) {
    if (iteration >= maxIterations) {
      throw new Error(
        `While loop exceeded max iterations (${maxIterations}). Possible infinite loop.`
      );
    }

    logger.debug({ stepId: step.id, iteration }, 'While loop iteration');

    for (const loopStep of step.steps) {
      lastOutput = await executeStep(loopStep, context, executeModuleFn, resolveVariablesFn);
    }

    iteration++;
  }

  logger.info({ stepId: step.id, iterations: iteration }, 'While loop completed');

  return lastOutput;
}

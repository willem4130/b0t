import { logger } from '../logger';
import type { ExecutionContext } from './executor';
import type { WorkflowStep } from './control-flow';

/**
 * Parallel Workflow Step Executor
 *
 * Automatically detects independent steps and executes them in parallel.
 *
 * Algorithm:
 * 1. Build dependency graph by analyzing {{variable}} references
 * 2. Group steps into "waves" where each wave contains independent steps
 * 3. Execute each wave in parallel with Promise.allSettled() (max 10 concurrent)
 * 4. Sequential waves ensure dependencies are met
 *
 * Example:
 * Step 1: fetch reddit (no deps)
 * Step 2: fetch youtube (no deps)
 * Step 3: fetch twitter (no deps)
 * Step 4: combine all (depends on 1,2,3)
 *
 * Execution:
 * Wave 1 (parallel): [1, 2, 3]
 * Wave 2 (sequential): [4]
 */

// Maximum concurrent steps per wave to prevent resource exhaustion
const MAX_WAVE_CONCURRENCY = parseInt(process.env.MAX_WAVE_CONCURRENCY || '10', 10);

/**
 * Execute promises with limited concurrency
 */
async function executeWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  concurrency: number
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const promise = fn(item).then(
      (value) => {
        results[i] = { status: 'fulfilled', value };
      },
      (reason) => {
        results[i] = { status: 'rejected', reason };
      }
    );

    executing.push(promise);

    if (executing.length >= concurrency || i === items.length - 1) {
      await Promise.all(executing);
      executing.length = 0;
    }
  }

  return results;
}

export interface StepDependencies {
  stepId: string;
  dependsOn: Set<string>; // IDs of steps this step depends on
  variables: Set<string>; // Variables this step references (e.g., "reddit", "youtube")
}

/**
 * Extract all variable references from a value
 * Handles: {{var}}, {{var.prop}}, {{var[0]}}, nested objects/arrays
 */
function extractVariableReferences(value: unknown, refs: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    // Match {{variableName}} or {{variableName.property}} or {{variableName[0]}}
    const matches = value.matchAll(/{{([^}]+)}}/g);
    for (const match of matches) {
      const fullPath = match[1]; // e.g., "reddit.items[0].title"
      // Extract root variable name (first part before . or [)
      const rootVar = fullPath.split(/[.\[]/, 1)[0];
      refs.add(rootVar);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => extractVariableReferences(item, refs));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => extractVariableReferences(v, refs));
  }

  return refs;
}

/**
 * Build dependency graph for all steps
 * Returns map of stepId -> dependencies
 */
export function buildDependencyGraph(
  steps: WorkflowStep[],
  context: ExecutionContext
): Map<string, StepDependencies> {
  const graph = new Map<string, StepDependencies>();
  const stepIds = new Set(steps.map((s) => s.id));

  // Built-in variables that don't represent step outputs
  const builtInVars = new Set(['user', 'trigger', ...Object.keys(context.variables)]);

  // Build mapping from outputAs variable names to step IDs
  // This allows us to track dependencies when steps use outputAs
  const outputVarToStepId = new Map<string, string>();
  for (const step of steps) {
    if (step.type === 'action' && 'outputAs' in step && step.outputAs) {
      outputVarToStepId.set(step.outputAs, step.id);
    }
  }

  for (const step of steps) {
    const variableRefs = new Set<string>();

    // Extract variable references from step inputs
    if (step.type === 'action' && step.inputs) {
      extractVariableReferences(step.inputs, variableRefs);
    } else if (step.type === 'condition' && step.condition) {
      extractVariableReferences(step.condition, variableRefs);
    } else if (step.type === 'forEach' && step.array) {
      extractVariableReferences(step.array, variableRefs);
    } else if (step.type === 'while' && step.condition) {
      extractVariableReferences(step.condition, variableRefs);
    }

    // Filter out built-in variables and resolve step dependencies
    const stepDependencies = new Set<string>();
    for (const varRef of variableRefs) {
      if (builtInVars.has(varRef)) continue;

      // Check if this variable references another step's output via outputAs
      const dependsOnStepId = outputVarToStepId.get(varRef);
      if (dependsOnStepId && dependsOnStepId !== step.id) {
        stepDependencies.add(dependsOnStepId);
      } else if (stepIds.has(varRef) && varRef !== step.id) {
        // Also support direct step ID references (for backward compatibility)
        stepDependencies.add(varRef);
      }
    }

    graph.set(step.id, {
      stepId: step.id,
      dependsOn: stepDependencies,
      variables: variableRefs,
    });
  }

  return graph;
}

/**
 * Group steps into parallel execution waves
 * Each wave contains steps with no dependencies on each other
 *
 * Returns: [[wave1 steps], [wave2 steps], ...]
 */
export function groupIntoWaves(
  steps: WorkflowStep[],
  graph: Map<string, StepDependencies>
): WorkflowStep[][] {
  const waves: WorkflowStep[][] = [];
  const completed = new Set<string>();
  const remaining = [...steps];

  while (remaining.length > 0) {
    const currentWave: WorkflowStep[] = [];

    // Find all steps whose dependencies are satisfied
    for (let i = remaining.length - 1; i >= 0; i--) {
      const step = remaining[i];
      const deps = graph.get(step.id);

      if (!deps) continue;

      // Check if all dependencies are completed
      const allDepsCompleted = Array.from(deps.dependsOn).every((depId) =>
        completed.has(depId)
      );

      if (allDepsCompleted) {
        currentWave.push(step);
        remaining.splice(i, 1);
      }
    }

    // If no steps can be executed, we have a circular dependency
    if (currentWave.length === 0 && remaining.length > 0) {
      logger.error(
        {
          remaining: remaining.map((s) => s.id),
          dependencies: Array.from(graph.entries()).map(([id, deps]) => ({
            id,
            dependsOn: Array.from(deps.dependsOn),
          })),
        },
        'Circular dependency detected in workflow steps'
      );
      throw new Error(
        `Circular dependency detected. Cannot resolve: ${remaining.map((s) => s.id).join(', ')}`
      );
    }

    if (currentWave.length > 0) {
      waves.push(currentWave);
      currentWave.forEach((step) => completed.add(step.id));
    }
  }

  return waves;
}

/**
 * Execute steps in parallel with automatic dependency resolution
 *
 * @param steps - All workflow steps
 * @param context - Execution context with variables
 * @param executeStepFn - Function to execute a single step
 * @returns Last output from final wave
 */
export async function executeStepsInParallel(
  steps: WorkflowStep[],
  context: ExecutionContext,
  executeStepFn: (
    step: WorkflowStep,
    context: ExecutionContext
  ) => Promise<unknown>
): Promise<unknown> {
  // Build dependency graph
  const graph = buildDependencyGraph(steps, context);

  logger.info(
    {
      totalSteps: steps.length,
      dependencies: Array.from(graph.entries()).map(([id, deps]) => ({
        stepId: id,
        dependsOn: Array.from(deps.dependsOn),
        variableRefs: Array.from(deps.variables),
      })),
    },
    'Built step dependency graph'
  );

  // Group into parallel execution waves
  const waves = groupIntoWaves(steps, graph);

  logger.info(
    {
      totalWaves: waves.length,
      waves: waves.map((wave, idx) => ({
        wave: idx + 1,
        steps: wave.map((s) => s.id),
        count: wave.length,
      })),
    },
    'Grouped steps into execution waves'
  );

  let lastOutput: unknown = null;

  // Execute each wave sequentially, steps within wave in parallel
  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    const wave = waves[waveIdx];

    if (wave.length === 1) {
      // Single step - execute directly
      const step = wave[0];
      logger.info(
        { waveNumber: waveIdx + 1, stepId: step.id },
        'Executing single step in wave'
      );
      lastOutput = await executeStepFn(step, context);
    } else {
      // Multiple steps - execute in parallel
      logger.info(
        {
          waveNumber: waveIdx + 1,
          stepCount: wave.length,
          stepIds: wave.map((s) => s.id),
        },
        'Executing steps in parallel'
      );

      const startTime = Date.now();

      // Execute all steps in wave with concurrency limit to prevent resource exhaustion
      const results = wave.length > MAX_WAVE_CONCURRENCY
        ? await executeWithConcurrency(
            wave,
            (step) => executeStepFn(step, context),
            MAX_WAVE_CONCURRENCY
          )
        : await Promise.allSettled(
            wave.map((step) => executeStepFn(step, context))
          );

      const duration = Date.now() - startTime;

      // Check for failures
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      const successes = results.filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled');

      if (failures.length > 0) {
        logger.error(
          {
            waveNumber: waveIdx + 1,
            failureCount: failures.length,
            totalSteps: wave.length,
            errors: failures.map((f) => f.reason instanceof Error ? f.reason.message : String(f.reason)),
          },
          'Partial wave failure - some steps failed'
        );

        // Throw error with details about all failures
        const errorMessages = failures.map((f) => {
          const stepId = wave.find((_, i) => results[i] === f)?.id || 'unknown';
          const error = f.reason instanceof Error ? f.reason.message : String(f.reason);
          return `Step ${stepId}: ${error}`;
        });
        throw new Error(`Wave ${waveIdx + 1} failed with ${failures.length} error(s):\n${errorMessages.join('\n')}`);
      }

      logger.info(
        {
          waveNumber: waveIdx + 1,
          stepCount: wave.length,
          duration,
          parallelSpeedup: `${wave.length}x potential`,
        },
        'Completed parallel wave execution'
      );

      // Last output is from the last successful step in the wave
      lastOutput = successes[successes.length - 1]?.value;
    }
  }

  return lastOutput;
}

/**
 * Analyze a workflow and return parallelization potential
 * Useful for debugging and optimization insights
 */
export function analyzeParallelizationPotential(
  steps: WorkflowStep[],
  context: ExecutionContext
): {
  totalSteps: number;
  waves: number;
  maxParallelism: number;
  averageParallelism: number;
  speedupPotential: string;
} {
  const graph = buildDependencyGraph(steps, context);
  const waves = groupIntoWaves(steps, graph);

  const maxParallelism = Math.max(...waves.map((w) => w.length));
  const averageParallelism =
    waves.reduce((sum, w) => sum + w.length, 0) / waves.length;

  // Theoretical speedup: total steps / number of waves
  const theoreticalSpeedup = (steps.length / waves.length).toFixed(2);

  return {
    totalSteps: steps.length,
    waves: waves.length,
    maxParallelism,
    averageParallelism: parseFloat(averageParallelism.toFixed(2)),
    speedupPotential: `${theoreticalSpeedup}x (${steps.length} steps in ${waves.length} waves)`,
  };
}

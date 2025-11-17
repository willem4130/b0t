import { logger } from '../logger';

/**
 * Simple Pipeline for Multi-Step Automations
 *
 * Zero dependencies - uses async/await with logging
 * Each step runs sequentially, passing data to next step
 */

export interface StepResult<T = unknown> {
  name: string;
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
}

export class Pipeline<T = unknown> {
  private steps: Array<{
    name: string;
    fn: (context: T) => Promise<T>;
  }> = [];

  /**
   * Add a step to the pipeline
   * Each step receives output from previous step as input
   */
  step<R = T>(
    name: string,
    fn: (context: T) => Promise<R>
  ): Pipeline<R> {
    this.steps.push({ name, fn: fn as unknown as (context: T) => Promise<T> });
    return this as unknown as Pipeline<R>;
  }

  /**
   * Execute all steps in sequence
   * Stops on first error unless continueOnError is true
   */
  async execute(
    initialContext: Partial<T>,
    options?: {
      continueOnError?: boolean;
      logResults?: boolean;
    }
  ): Promise<{
    success: boolean;
    results: StepResult[];
    finalData?: unknown;
  }> {
    const results: StepResult[] = [];
    let context = initialContext as T;

    logger.info({ pipeline: 'start', steps: this.steps.length }, 'Starting pipeline');

    for (const step of this.steps) {
      const startTime = Date.now();

      try {
        logger.info({ step: step.name }, `▶️  ${step.name}`);

        const result = await step.fn(context);
        const duration = Date.now() - startTime;

        results.push({
          name: step.name,
          success: true,
          data: result,
          duration,
        });

        logger.info(
          { step: step.name, duration },
          `✅ ${step.name} (${duration}ms)`
        );

        context = result as T;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.push({
          name: step.name,
          success: false,
          error: errorMessage,
          duration,
        });

        logger.error(
          { step: step.name, error: errorMessage, duration },
          `❌ ${step.name} failed`
        );

        if (!options?.continueOnError) {
          logger.error({ pipeline: 'failed', completedSteps: results.length }, 'Pipeline stopped');
          return { success: false, results };
        }
      }
    }

    const allSuccessful = results.every((r) => r.success);

    if (options?.logResults) {
      logger.info({ results }, 'Pipeline results');
    }

    logger.info(
      { pipeline: 'complete', success: allSuccessful },
      allSuccessful ? '✅ Pipeline completed' : '⚠️  Pipeline completed with errors'
    );

    return {
      success: allSuccessful,
      results,
      finalData: context,
    };
  }
}

/**
 * Helper to create a new pipeline
 */
export function createPipeline<T = unknown>() {
  return new Pipeline<T>();
}

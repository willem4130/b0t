import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Parallel Execution Module
 *
 * Execute multiple operations in parallel with advanced patterns:
 * - Run steps in parallel, wait for all
 * - Race conditions (first to complete wins)
 * - Wait for first N completions
 * - Timeout handling for parallel operations
 * - Map array items with concurrent processing
 * - Parallel execution with progress tracking
 *
 * Perfect for:
 * - Fetching data from multiple APIs simultaneously
 * - Processing large datasets with concurrency limits
 * - Racing between multiple providers (fallback pattern)
 * - Batch operations with timeout control
 */

// Generic rate limiter for parallel operations
const parallelRateLimiter = createRateLimiter({
  maxConcurrent: 50,
  minTime: 10,
  id: 'parallel-execution',
});

export interface ParallelTask<T = unknown> {
  name: string;
  fn: () => Promise<T>;
  timeout?: number;
}

export interface ParallelResult<T = unknown> {
  name: string;
  status: 'fulfilled' | 'rejected';
  value?: T;
  error?: Error;
  duration: number;
}

export interface ParallelAllOptions {
  timeout?: number;
  stopOnError?: boolean;
}

/**
 * Internal function to run parallel tasks
 */
async function runParallelTasksInternal<T>(
  tasks: ParallelTask<T>[],
  options: ParallelAllOptions = {}
): Promise<ParallelResult<T>[]> {
  logger.info({ taskCount: tasks.length }, 'Running parallel tasks');

  const timeout = options.timeout || 300000; // 5 minutes default

  const taskPromises = tasks.map(async (task) => {
    const taskStart = Date.now();

    try {
      const taskTimeout = task.timeout || timeout;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Task "${task.name}" timed out after ${taskTimeout}ms`)), taskTimeout);
      });

      const value = await Promise.race([task.fn(), timeoutPromise]);
      const taskEnd = Date.now();

      return {
        name: task.name,
        status: 'fulfilled' as const,
        value,
        duration: taskEnd - taskStart,
      };
    } catch (error) {
      const taskEnd = Date.now();

      logger.error({ task: task.name, error }, 'Parallel task failed');

      return {
        name: task.name,
        status: 'rejected' as const,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: taskEnd - taskStart,
      };
    }
  });

  if (options.stopOnError) {
    // Fail fast if any task fails
    const results = await Promise.all(taskPromises);
    return results;
  } else {
    // Wait for all tasks, even if some fail
    const results = await Promise.allSettled(taskPromises);

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          name: 'unknown',
          status: 'rejected' as const,
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
          duration: 0,
        };
      }
    });
  }
}

const runParallelTasksWithBreaker = createCircuitBreaker(runParallelTasksInternal, {
  timeout: 310000,
  name: 'parallel-tasks',
});

const runParallelTasksRateLimited = withRateLimit(
  async <T>(tasks: ParallelTask<T>[], options: ParallelAllOptions = {}) =>
    runParallelTasksWithBreaker.fire(tasks, options),
  parallelRateLimiter
);

/**
 * Run all tasks in parallel and wait for all to complete
 */
export async function parallelAll<T>(
  tasks: ParallelTask<T>[],
  options: ParallelAllOptions = {}
): Promise<ParallelResult<T>[]> {
  return await runParallelTasksRateLimited(tasks, options) as ParallelResult<T>[];
}

/**
 * Race multiple tasks - return the first one to complete
 */
export async function parallelRace<T>(
  tasks: ParallelTask<T>[],
  options: { timeout?: number } = {}
): Promise<ParallelResult<T>> {
  logger.info({ taskCount: tasks.length }, 'Racing parallel tasks');

  const timeout = options.timeout || 60000;

  const racePromises = tasks.map(async (task) => {
    const taskStart = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Task "${task.name}" timed out`)), timeout);
      });

      const value = await Promise.race([task.fn(), timeoutPromise]);
      const taskEnd = Date.now();

      return {
        name: task.name,
        status: 'fulfilled' as const,
        value,
        duration: taskEnd - taskStart,
      };
    } catch (error) {
      const taskEnd = Date.now();

      throw {
        name: task.name,
        status: 'rejected' as const,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: taskEnd - taskStart,
      };
    }
  });

  try {
    const winner = await Promise.race(racePromises);
    logger.info({ winner: winner.name, duration: winner.duration }, 'Task won the race');
    return winner;
  } catch (error: unknown) {
    logger.error({ error }, 'All tasks in race failed');
    throw error;
  }
}

/**
 * Wait for the first N tasks to complete
 */
export async function parallelAny<T>(
  tasks: ParallelTask<T>[],
  options: { count?: number; timeout?: number } = {}
): Promise<ParallelResult<T>[]> {
  const count = options.count || 1;
  const timeout = options.timeout || 60000;

  logger.info({ taskCount: tasks.length, targetCount: count }, 'Waiting for first N tasks');

  if (count > tasks.length) {
    throw new Error(`Cannot wait for ${count} tasks when only ${tasks.length} are provided`);
  }

  const results: ParallelResult<T>[] = [];
  const promises = tasks.map(async (task, index) => {
    const taskStart = Date.now();

    try {
      const value = await task.fn();
      const taskEnd = Date.now();

      return {
        name: task.name,
        status: 'fulfilled' as const,
        value,
        duration: taskEnd - taskStart,
        index,
      };
    } catch (error) {
      const taskEnd = Date.now();

      return {
        name: task.name,
        status: 'rejected' as const,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: taskEnd - taskStart,
        index,
      };
    }
  });

  // Wait for count number of completions
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout waiting for ${count} tasks`)), timeout);
  });

  try {
    for await (const result of promises) {
      results.push(result);

      if (results.filter(r => r.status === 'fulfilled').length >= count) {
        logger.info({ completedCount: results.length }, 'Target task count reached');
        break;
      }
    }

    return results.slice(0, count);
  } catch (error) {
    throw await Promise.race([Promise.reject(error), timeoutPromise]);
  }
}

/**
 * Map an array with concurrent processing
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: { concurrency?: number; timeout?: number } = {}
): Promise<Array<{ value?: R; error?: Error; index: number }>> {
  const concurrency = options.concurrency || 10;
  const timeout = options.timeout || 300000;

  logger.info({ itemCount: items.length, concurrency }, 'Parallel mapping items');

  const results: Array<{ value?: R; error?: Error; index: number }> = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const index = i;
    const item = items[i];

    const promise = (async () => {
      const taskStart = Date.now();

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Item ${index} timed out`)), timeout);
        });

        const value = await Promise.race([fn(item, index), timeoutPromise]);

        results[index] = { value, index };

        logger.debug({ index, duration: Date.now() - taskStart }, 'Parallel map item completed');
      } catch (error) {
        results[index] = {
          error: error instanceof Error ? error : new Error(String(error)),
          index,
        };

        logger.error({ index, error }, 'Parallel map item failed');
      }
    })();

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }

  await Promise.all(executing);

  logger.info({ totalItems: items.length, successCount: results.filter(r => r.value !== undefined).length }, 'Parallel map completed');

  return results;
}

/**
 * Execute tasks in batches with concurrency control
 */
export async function parallelBatch<T>(
  tasks: ParallelTask<T>[],
  options: { batchSize?: number; delayBetweenBatches?: number } = {}
): Promise<ParallelResult<T>[]> {
  const batchSize = options.batchSize || 5;
  const delayBetweenBatches = options.delayBetweenBatches || 0;

  logger.info({ taskCount: tasks.length, batchSize }, 'Running tasks in batches');

  const allResults: ParallelResult<T>[] = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);

    logger.info({ batchNumber: Math.floor(i / batchSize) + 1, batchSize: batch.length }, 'Processing batch');

    const batchResults = await parallelAll(batch);
    allResults.push(...batchResults);

    if (i + batchSize < tasks.length && delayBetweenBatches > 0) {
      logger.info({ delay: delayBetweenBatches }, 'Waiting between batches');
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  logger.info({ totalResults: allResults.length }, 'All batches completed');

  return allResults;
}

/**
 * Retry failed tasks from parallel execution
 */
export async function retryFailedTasks<T>(
  results: ParallelResult<T>[],
  taskMap: Map<string, ParallelTask<T>>,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<ParallelResult<T>[]> {
  const maxRetries = options.maxRetries || 3;
  const retryDelay = options.retryDelay || 1000;

  const failedResults = results.filter(r => r.status === 'rejected');

  logger.info({ failedCount: failedResults.length, maxRetries }, 'Retrying failed tasks');

  if (failedResults.length === 0) {
    return results;
  }

  const retriedResults = [...results];

  for (const failedResult of failedResults) {
    const task = taskMap.get(failedResult.name);

    if (!task) {
      logger.warn({ taskName: failedResult.name }, 'Task not found for retry');
      continue;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info({ taskName: task.name, attempt }, 'Retrying task');

      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));

      try {
        const taskStart = Date.now();
        const value = await task.fn();
        const taskEnd = Date.now();

        const index = retriedResults.findIndex(r => r.name === failedResult.name);
        retriedResults[index] = {
          name: task.name,
          status: 'fulfilled',
          value,
          duration: taskEnd - taskStart,
        };

        logger.info({ taskName: task.name, attempt }, 'Task retry succeeded');
        break;
      } catch (error) {
        logger.warn({ taskName: task.name, attempt, error }, 'Task retry failed');

        if (attempt === maxRetries) {
          logger.error({ taskName: task.name }, 'Task failed after all retries');
        }
      }
    }
  }

  return retriedResults;
}

/**
 * Get summary statistics from parallel results
 */
export function getParallelStats<T>(results: ParallelResult<T>[]): {
  total: number;
  successful: number;
  failed: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
} {
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const durations = results.map(r => r.duration);
  const totalDuration = durations.reduce((sum, d) => sum + d, 0);

  return {
    total: results.length,
    successful,
    failed,
    totalDuration,
    averageDuration: totalDuration / results.length,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
  };
}

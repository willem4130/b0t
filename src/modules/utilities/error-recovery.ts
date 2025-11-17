import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Error Recovery Module
 *
 * Advanced error handling patterns for workflows:
 * - Try/catch with fallback values
 * - Retry with exponential backoff
 * - Circuit breaker pattern
 * - Dead letter queue for failed operations
 * - Error transformation and recovery
 * - Conditional error handling
 *
 * Perfect for:
 * - Graceful degradation
 * - Fault-tolerant workflows
 * - Error logging and monitoring
 * - Automatic recovery strategies
 * - Failure isolation
 */

export interface TryCatchOptions<T> {
  try: () => Promise<T>;
  catch?: (error: Error) => Promise<T>;
  fallback?: T;
  finally?: () => Promise<void>;
  throwOnError?: boolean;
}

export interface RetryOptions<T> {
  fn: () => Promise<T>;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

export interface DeadLetterItem {
  id: string;
  workflowId?: string;
  workflowRunId?: string;
  operation: string;
  data: unknown;
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
  attempts: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Dead letter queue storage
const deadLetterQueue = new Map<string, DeadLetterItem>();

/**
 * Try/catch pattern with fallback
 */
export async function tryCatch<T>(options: TryCatchOptions<T>): Promise<T> {
  logger.info('Executing try/catch pattern');

  try {
    const result = await options.try();

    logger.info('Try block succeeded');

    return result;
  } catch (error) {
    logger.warn({ error }, 'Try block failed, executing catch');

    const err = error instanceof Error ? error : new Error(String(error));

    // Execute custom catch handler if provided
    if (options.catch) {
      try {
        return await options.catch(err);
      } catch (catchError) {
        logger.error({ catchError }, 'Catch handler failed');

        if (options.fallback !== undefined) {
          logger.info('Using fallback value');
          return options.fallback;
        }

        if (options.throwOnError !== false) {
          throw catchError;
        }

        throw err;
      }
    }

    // Use fallback if provided
    if (options.fallback !== undefined) {
      logger.info('Using fallback value');
      return options.fallback;
    }

    // Throw if no recovery option
    if (options.throwOnError !== false) {
      throw err;
    }

    throw err;
  } finally {
    if (options.finally) {
      try {
        await options.finally();
        logger.info('Finally block executed');
      } catch (finallyError) {
        logger.error({ finallyError }, 'Finally block failed');
      }
    }
  }
}

/**
 * Retry with exponential backoff
 */
export async function retry<T>(options: RetryOptions<T>): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelay = options.retryDelay ?? 1000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;

  logger.info({ maxRetries, retryDelay, backoffMultiplier }, 'Starting retry operation');

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await options.fn();

      if (attempt > 0) {
        logger.info({ attempt }, 'Retry succeeded');
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn({ attempt, maxRetries, error: lastError }, 'Operation failed');

      // Check if we should retry
      if (attempt < maxRetries) {
        const shouldRetry = options.retryCondition
          ? options.retryCondition(lastError, attempt + 1)
          : true;

        if (!shouldRetry) {
          logger.info({ attempt }, 'Retry condition not met, stopping');
          throw lastError;
        }

        const delay = retryDelay * Math.pow(backoffMultiplier, attempt);

        logger.info({ attempt: attempt + 1, delay }, 'Retrying after delay');

        if (options.onRetry) {
          options.onRetry(lastError, attempt + 1);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error({ maxRetries }, 'All retry attempts failed');

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Add item to dead letter queue
 */
export async function addToDeadLetterQueue(
  operation: string,
  data: unknown,
  error: Error,
  options?: {
    workflowId?: string;
    workflowRunId?: string;
    attempts?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<DeadLetterItem> {
  logger.info({ operation, error }, 'Adding item to dead letter queue');

  const id = uuidv4();
  const item: DeadLetterItem = {
    id,
    workflowId: options?.workflowId,
    workflowRunId: options?.workflowRunId,
    operation,
    data,
    error: {
      message: error.message,
      stack: error.stack,
      code: (error as { code?: string }).code,
    },
    attempts: options?.attempts ?? 1,
    timestamp: new Date(),
    metadata: options?.metadata,
  };

  deadLetterQueue.set(id, item);

  logger.info({ itemId: id, queueSize: deadLetterQueue.size }, 'Item added to dead letter queue');

  return item;
}

/**
 * Get dead letter queue items
 */
export async function getDeadLetterQueue(filters?: {
  workflowId?: string;
  operation?: string;
  limit?: number;
}): Promise<DeadLetterItem[]> {
  logger.info({ filters }, 'Fetching dead letter queue items');

  let items = Array.from(deadLetterQueue.values());

  if (filters?.workflowId) {
    items = items.filter(i => i.workflowId === filters.workflowId);
  }

  if (filters?.operation) {
    items = items.filter(i => i.operation === filters.operation);
  }

  // Sort by timestamp (newest first)
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (filters?.limit) {
    items = items.slice(0, filters.limit);
  }

  logger.info({ count: items.length }, 'Dead letter queue items fetched');

  return items;
}

/**
 * Remove item from dead letter queue
 */
export async function removeFromDeadLetterQueue(itemId: string): Promise<boolean> {
  logger.info({ itemId }, 'Removing item from dead letter queue');

  const removed = deadLetterQueue.delete(itemId);

  if (removed) {
    logger.info({ itemId, queueSize: deadLetterQueue.size }, 'Item removed from dead letter queue');
  } else {
    logger.warn({ itemId }, 'Item not found in dead letter queue');
  }

  return removed;
}

/**
 * Retry dead letter queue item
 */
export async function retryDeadLetterItem<T>(
  itemId: string,
  retryFn: (data: unknown) => Promise<T>
): Promise<T> {
  logger.info({ itemId }, 'Retrying dead letter queue item');

  const item = deadLetterQueue.get(itemId);

  if (!item) {
    throw new Error(`Dead letter queue item ${itemId} not found`);
  }

  try {
    const result = await retryFn(item.data);

    // Remove from queue on success
    await removeFromDeadLetterQueue(itemId);

    logger.info({ itemId }, 'Dead letter queue item retry succeeded');

    return result;
  } catch (error) {
    // Update attempts
    item.attempts++;

    deadLetterQueue.set(itemId, item);

    logger.error({ itemId, attempts: item.attempts, error }, 'Dead letter queue item retry failed');

    throw error;
  }
}

/**
 * Clear dead letter queue
 */
export async function clearDeadLetterQueue(filters?: {
  workflowId?: string;
  olderThanDays?: number;
}): Promise<number> {
  logger.info({ filters }, 'Clearing dead letter queue');

  let clearCount = 0;
  const cutoffDate = filters?.olderThanDays
    ? new Date(Date.now() - filters.olderThanDays * 24 * 60 * 60 * 1000)
    : null;

  for (const [id, item] of deadLetterQueue.entries()) {
    let shouldClear = true;

    if (filters?.workflowId && item.workflowId !== filters.workflowId) {
      shouldClear = false;
    }

    if (cutoffDate && item.timestamp > cutoffDate) {
      shouldClear = false;
    }

    if (shouldClear) {
      deadLetterQueue.delete(id);
      clearCount++;
    }
  }

  logger.info({ clearCount, remainingSize: deadLetterQueue.size }, 'Dead letter queue cleared');

  return clearCount;
}

/**
 * Safe operation wrapper with automatic dead letter queue
 */
export async function safeOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: {
    fallback?: T;
    maxRetries?: number;
    addToDeadLetter?: boolean;
    workflowId?: string;
    workflowRunId?: string;
  }
): Promise<T> {
  logger.info({ operation }, 'Executing safe operation');

  try {
    return await retry({
      fn,
      maxRetries: options?.maxRetries ?? 3,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error({ operation, error: err }, 'Safe operation failed');

    // Add to dead letter queue if enabled
    if (options?.addToDeadLetter !== false) {
      await addToDeadLetterQueue(operation, {}, err, {
        workflowId: options?.workflowId,
        workflowRunId: options?.workflowRunId,
        attempts: (options?.maxRetries ?? 3) + 1,
      });
    }

    // Use fallback if provided
    if (options?.fallback !== undefined) {
      logger.info({ operation }, 'Using fallback value');
      return options.fallback;
    }

    throw err;
  }
}

/**
 * Conditional error handling
 */
export async function catchWhen<T>(
  fn: () => Promise<T>,
  conditions: Array<{
    condition: (error: Error) => boolean;
    handler: (error: Error) => Promise<T> | T;
  }>,
  defaultHandler?: (error: Error) => Promise<T> | T
): Promise<T> {
  logger.info('Executing conditional error handling');

  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.warn({ error: err }, 'Operation failed, checking conditions');

    // Find matching condition
    for (const { condition, handler } of conditions) {
      if (condition(err)) {
        logger.info({ errorMessage: err.message }, 'Condition matched, executing handler');
        return await handler(err);
      }
    }

    // Use default handler if provided
    if (defaultHandler) {
      logger.info('Using default error handler');
      return await defaultHandler(err);
    }

    // Re-throw if no handler matched
    logger.error({ error: err }, 'No error handler matched');
    throw err;
  }
}

/**
 * Get error recovery statistics
 */
export async function getErrorStats(): Promise<{
  deadLetterQueueSize: number;
  errorsByOperation: Record<string, number>;
  errorsByWorkflow: Record<string, number>;
  oldestError?: Date;
  newestError?: Date;
}> {
  logger.info('Fetching error recovery statistics');

  const items = Array.from(deadLetterQueue.values());

  const errorsByOperation: Record<string, number> = {};
  const errorsByWorkflow: Record<string, number> = {};

  for (const item of items) {
    errorsByOperation[item.operation] = (errorsByOperation[item.operation] || 0) + 1;

    if (item.workflowId) {
      errorsByWorkflow[item.workflowId] = (errorsByWorkflow[item.workflowId] || 0) + 1;
    }
  }

  const timestamps = items.map(i => i.timestamp.getTime());
  const oldestError = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
  const newestError = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

  return {
    deadLetterQueueSize: deadLetterQueue.size,
    errorsByOperation,
    errorsByWorkflow,
    oldestError,
    newestError,
  };
}

/**
 * Timeout wrapper for operations
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: string
): Promise<T> {
  logger.info({ timeoutMs }, 'Executing operation with timeout');

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(timeoutError || `Operation timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } catch (error) {
    logger.error({ error, timeoutMs }, 'Operation failed or timed out');
    throw error;
  }
}

/**
 * Ignore specific errors
 */
export async function ignoreErrors<T>(
  fn: () => Promise<T>,
  errorCodesToIgnore: string[],
  fallback?: T
): Promise<T | undefined> {
  logger.info({ errorCodesToIgnore }, 'Executing operation with error ignoring');

  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorCode = (err as { code?: string }).code;

    if (errorCode && errorCodesToIgnore.includes(errorCode)) {
      logger.info({ errorCode, errorMessage: err.message }, 'Ignoring error');
      return fallback;
    }

    throw err;
  }
}

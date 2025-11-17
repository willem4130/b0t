import { createCircuitBreaker } from '@/lib/resilience';
import { logger } from '@/lib/logger';

/**
 * Control Flow Utilities Module
 *
 * Helper functions for control flow logic in workflows
 * - Null coalescing and conditional logic
 * - Switch/case pattern matching
 * - Retry and timeout utilities
 * - Sleep/delay helpers
 *
 * Perfect for:
 * - Handling optional workflow values
 * - Implementing retry logic for unreliable operations
 * - Adding delays between workflow steps
 * - Building complex conditional logic
 */

/**
 * Return first non-null/undefined value from a list
 * @param values - List of values to check
 * @returns First non-null/undefined value, or null if all are null/undefined
 */
export function coalesce<T>(...values: (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      logger.debug({ value }, 'Coalesce found non-null value');
      return value;
    }
  }

  logger.debug('Coalesce found no non-null values');
  return null;
}

/**
 * Return value or default if value is null/undefined
 * @param value - Value to check
 * @param defaultVal - Default value to return if value is null/undefined
 * @returns Original value or default
 */
export function defaultValue<T>(value: T | null | undefined, defaultVal: T): T {
  if (value !== null && value !== undefined) {
    return value;
  }

  logger.debug({ defaultVal }, 'Using default value');
  return defaultVal;
}

/**
 * Ternary conditional helper
 * @param condition - Boolean condition to evaluate
 * @param trueVal - Value to return if condition is true
 * @param falseVal - Value to return if condition is false
 * @returns trueVal if condition is true, falseVal otherwise
 */
export function conditional<T>(condition: boolean, trueVal: T, falseVal: T): T {
  const result = condition ? trueVal : falseVal;
  logger.debug({ condition, result }, 'Conditional evaluated');
  return result;
}

/**
 * Switch/case pattern helper
 * @param value - Value to match against cases
 * @param cases - Object mapping values to results
 * @param defaultCase - Default value if no case matches
 * @returns Matching case value or default
 */
export function switchCase<T, R>(
  value: T,
  cases: Record<string, R>,
  defaultCase: R
): R {
  const key = String(value);
  const result = key in cases ? cases[key] : defaultCase;

  logger.debug({ value, key, hasMatch: key in cases }, 'Switch case evaluated');
  return result;
}

/**
 * Retry a function with exponential backoff
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param delayMs - Initial delay between retries in milliseconds (default: 1000)
 * @returns Result of successful function execution
 * @throws Error if all attempts fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info({ attempt, maxAttempts }, 'Attempting function execution');
      const result = await fn();

      logger.info({ attempt }, 'Function execution succeeded');
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn(
        { attempt, maxAttempts, error: lastError.message },
        'Function execution failed'
      );

      if (attempt < maxAttempts) {
        const backoffDelay = delayMs * Math.pow(2, attempt - 1);
        logger.info({ backoffDelay }, 'Waiting before retry');
        await sleep(backoffDelay);
      }
    }
  }

  logger.error({ maxAttempts, error: lastError?.message }, 'All retry attempts failed');
  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}

/**
 * Internal timeout implementation
 */
async function timeoutInternal<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  logger.info({ timeoutMs }, 'Executing function with timeout');

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    logger.info('Function completed within timeout');
    return result;
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ error: error.message }, 'Function failed or timed out');
      throw error;
    }
    throw new Error('Unknown error during timeout execution');
  }
}

/**
 * Execute function with timeout (protected by circuit breaker)
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Result of function execution
 * @throws Error if function times out
 */
const timeoutWithBreaker = createCircuitBreaker(timeoutInternal, {
  timeout: 35000, // Slightly higher than default timeout
  name: 'timeout-executor',
});

export async function timeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  return timeoutWithBreaker.fire(fn, timeoutMs) as Promise<T>;
}

/**
 * Sleep/delay for specified milliseconds
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
export function sleep(ms: number): Promise<void> {
  logger.debug({ ms }, 'Sleeping');

  return new Promise((resolve) => {
    setTimeout(() => {
      logger.debug({ ms }, 'Sleep completed');
      resolve();
    }, ms);
  });
}

/**
 * Check if value is truthy
 * @param value - Value to check
 * @returns True if value is truthy
 */
export function isTruthy(value: unknown): boolean {
  return !!value;
}

/**
 * Check if value is falsy
 * @param value - Value to check
 * @returns True if value is falsy
 */
export function isFalsy(value: unknown): boolean {
  return !value;
}

/**
 * Check if value is null or undefined
 * @param value - Value to check
 * @returns True if value is null or undefined
 */
export function isNullOrUndefined(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Check if value is defined (not null or undefined)
 * @param value - Value to check
 * @returns True if value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * If-else branching with explicit true/false paths
 * More explicit than conditional() for complex branching logic
 * @param condition - Boolean condition to evaluate
 * @param ifTrue - Value to return if condition is true
 * @param ifFalse - Value to return if condition is false
 * @returns ifTrue or ifFalse based on condition
 * @example ifElse(score > 90, "A", "B")
 */
export function ifElse<T>(condition: boolean, ifTrue: T, ifFalse: T): T {
  logger.debug({ condition, ifTrue, ifFalse }, 'Evaluating if-else');
  return condition ? ifTrue : ifFalse;
}

/**
 * Filter array and execute different logic based on condition
 * Splits array into two groups: items matching condition, and items not matching
 * @param items - Array to partition
 * @param field - Field to check in each item
 * @param operator - Comparison operator
 * @param value - Value to compare against
 * @returns Object with {matched: [], unmatched: []}
 * @example partitionByCondition(items, "score", ">", 80) => {matched: [...], unmatched: [...]}
 */
export function partitionByCondition<T extends Record<string, unknown>>(
  items: T[],
  field: string,
  operator: '===' | '!==' | '>' | '<' | '>=' | '<=',
  value: unknown
): { matched: T[]; unmatched: T[] } {
  logger.info({ itemCount: items.length, field, operator, value }, 'Partitioning array by condition');

  const matched: T[] = [];
  const unmatched: T[] = [];

  for (const item of items) {
    const itemValue = item[field] as number | string;
    const comparisonValue = value as number | string;
    let matches = false;

    switch (operator) {
      case '===':
        matches = itemValue === comparisonValue;
        break;
      case '!==':
        matches = itemValue !== comparisonValue;
        break;
      case '>':
        matches = itemValue > comparisonValue;
        break;
      case '<':
        matches = itemValue < comparisonValue;
        break;
      case '>=':
        matches = itemValue >= comparisonValue;
        break;
      case '<=':
        matches = itemValue <= comparisonValue;
        break;
    }

    if (matches) {
      matched.push(item);
    } else {
      unmatched.push(item);
    }
  }

  logger.info({ matchedCount: matched.length, unmatchedCount: unmatched.length }, 'Partition complete');

  return { matched, unmatched };
}

/**
 * Try-catch error handling wrapper
 * Returns success/error object instead of throwing
 * @param attemptValue - Value from attempted operation
 * @param errorValue - Value to return if attemptValue indicates error
 * @param errorCheck - How to check if attemptValue is an error (default: check for error/exception properties)
 * @returns attemptValue if successful, errorValue if error detected
 * @example tryCatch(result, {error: "Failed"})
 */
export function tryCatch<T>(
  attemptValue: T,
  errorValue: T,
  errorCheck?: (value: T) => boolean
): T {
  logger.debug({ attemptValue, errorValue }, 'Evaluating try-catch');

  // Default error check - look for error indicators
  const hasError = errorCheck
    ? errorCheck(attemptValue)
    : (attemptValue &&
        typeof attemptValue === 'object' &&
        ('error' in attemptValue || 'exception' in attemptValue || 'failed' in attemptValue));

  if (hasError) {
    logger.info('Error detected, returning error value');
    return errorValue;
  }

  logger.debug('No error detected, returning attempt value');
  return attemptValue;
}

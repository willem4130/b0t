import { createCircuitBreaker } from '@/lib/resilience';
import { logger } from '@/lib/logger';
import { median as arrayMedian } from './array-utils';

/**
 * Aggregation Utilities Module
 *
 * Advanced data aggregation and statistical analysis functions for workflows
 * - Group data with multiple aggregation operations
 * - Statistical measures (percentile, variance, standard deviation)
 * - Mode and frequency analysis
 * - Summary statistics generation
 *
 * Perfect for:
 * - Analyzing API response data
 * - Computing metrics and KPIs
 * - Generating data summaries
 * - Statistical analysis of datasets
 */

/**
 * Aggregation operation type
 */
export type AggregationOperation = 'sum' | 'avg' | 'count' | 'min' | 'max';

/**
 * Aggregation configuration
 */
export interface Aggregation {
  field: string;
  operation: AggregationOperation;
  outputAs: string;
}

/**
 * Group result with aggregations
 */
export interface GroupResult {
  groupValue: unknown;
  [key: string]: unknown;
}

/**
 * Summary statistics result
 */
export interface SummaryStats {
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
  median: number;
  variance: number;
  stdDeviation: number;
}

/**
 * Helper: Get nested property value from object
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Helper: Extract numeric values from items for a field
 */
function extractNumbers(
  items: Record<string, unknown>[],
  field: string
): number[] {
  return items
    .map((item) => {
      const value = getNestedValue(item, field);
      return typeof value === 'number' ? value : NaN;
    })
    .filter((n) => !isNaN(n));
}

/**
 * Group array of objects by a field and apply aggregation operations
 *
 * @example
 * const data = [
 *   { category: 'A', amount: 100 },
 *   { category: 'A', amount: 200 },
 *   { category: 'B', amount: 150 }
 * ];
 * groupAndAggregate(data, 'category', [
 *   { field: 'amount', operation: 'sum', outputAs: 'total' },
 *   { field: 'amount', operation: 'avg', outputAs: 'average' }
 * ]);
 * // Returns:
 * // [
 * //   { groupValue: 'A', total: 300, average: 150 },
 * //   { groupValue: 'B', total: 150, average: 150 }
 * // ]
 */
async function groupAndAggregateInternal(
  items: Record<string, unknown>[],
  groupField: string,
  aggregations: Aggregation[]
): Promise<GroupResult[]> {
  logger.info(
    {
      itemCount: items.length,
      groupField,
      aggregationCount: aggregations.length,
    },
    'Grouping and aggregating data'
  );

  if (!Array.isArray(items) || items.length === 0) {
    logger.warn('No items provided for grouping');
    return [];
  }

  if (!groupField || !aggregations || aggregations.length === 0) {
    throw new Error('Group field and aggregations are required');
  }

  // Group items by field value
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const groupValue = String(getNestedValue(item, groupField) ?? 'null');
    if (!groups.has(groupValue)) {
      groups.set(groupValue, []);
    }
    groups.get(groupValue)!.push(item);
  }

  logger.info({ groupCount: groups.size }, 'Groups created');

  // Apply aggregations to each group
  const results: GroupResult[] = [];
  for (const [groupValue, groupItems] of groups) {
    const result: GroupResult = { groupValue };

    for (const agg of aggregations) {
      const numbers = extractNumbers(groupItems, agg.field);

      switch (agg.operation) {
        case 'sum':
          result[agg.outputAs] = numbers.reduce((sum, n) => sum + n, 0);
          break;
        case 'avg':
          result[agg.outputAs] =
            numbers.length > 0
              ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length
              : 0;
          break;
        case 'count':
          result[agg.outputAs] = groupItems.length;
          break;
        case 'min':
          result[agg.outputAs] =
            numbers.length > 0 ? Math.min(...numbers) : null;
          break;
        case 'max':
          result[agg.outputAs] =
            numbers.length > 0 ? Math.max(...numbers) : null;
          break;
        default:
          logger.warn({ operation: agg.operation }, 'Unknown aggregation operation');
      }
    }

    results.push(result);
  }

  logger.info({ resultCount: results.length }, 'Aggregation complete');
  return results;
}

/**
 * Calculate percentile of numeric array
 *
 * @param numbers - Array of numbers
 * @param percent - Percentile to calculate (0-100)
 * @returns The value at the specified percentile
 *
 * @example
 * percentile([1, 2, 3, 4, 5], 50); // Returns: 3 (median)
 * percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90); // Returns: 9
 */
async function percentileInternal(
  numbers: number[],
  percent: number
): Promise<number> {
  logger.info({ count: numbers.length, percent }, 'Calculating percentile');

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error('Numbers array is required and must not be empty');
  }

  if (percent < 0 || percent > 100) {
    throw new Error('Percent must be between 0 and 100');
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (percent / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sorted[lower];
  }

  const result = sorted[lower] * (1 - weight) + sorted[upper] * weight;
  logger.info({ result }, 'Percentile calculated');
  return result;
}

/**
 * Calculate median of numeric array
 *
 * Note: This wraps the existing median function from array-utils
 *
 * @param numbers - Array of numbers
 * @returns The median value
 *
 * @example
 * median([1, 2, 3, 4, 5]); // Returns: 3
 * median([1, 2, 3, 4]); // Returns: 2.5
 */
async function medianInternal(numbers: number[]): Promise<number> {
  logger.info({ count: numbers.length }, 'Calculating median');

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error('Numbers array is required and must not be empty');
  }

  const result = arrayMedian(numbers);
  logger.info({ result }, 'Median calculated');
  return result;
}

/**
 * Calculate variance of numeric array
 *
 * @param numbers - Array of numbers
 * @returns The variance
 *
 * @example
 * variance([1, 2, 3, 4, 5]); // Returns: 2
 */
async function varianceInternal(numbers: number[]): Promise<number> {
  logger.info({ count: numbers.length }, 'Calculating variance');

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error('Numbers array is required and must not be empty');
  }

  const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  const squaredDiffs = numbers.map((n) => Math.pow(n - mean, 2));
  const result = squaredDiffs.reduce((sum, d) => sum + d, 0) / numbers.length;

  logger.info({ result, mean }, 'Variance calculated');
  return result;
}

/**
 * Calculate standard deviation of numeric array
 *
 * @param numbers - Array of numbers
 * @returns The standard deviation
 *
 * @example
 * stdDeviation([1, 2, 3, 4, 5]); // Returns: ~1.414
 */
async function stdDeviationInternal(numbers: number[]): Promise<number> {
  logger.info({ count: numbers.length }, 'Calculating standard deviation');

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error('Numbers array is required and must not be empty');
  }

  const varianceValue = await varianceInternal(numbers);
  const result = Math.sqrt(varianceValue);

  logger.info({ result, variance: varianceValue }, 'Standard deviation calculated');
  return result;
}

/**
 * Find the most frequent value(s) in an array
 *
 * @param items - Array of any values
 * @returns The mode value(s) - returns array if multiple modes exist
 *
 * @example
 * mode([1, 2, 2, 3, 3, 3]); // Returns: 3
 * mode([1, 1, 2, 2, 3]); // Returns: [1, 2] (bimodal)
 */
async function modeInternal(items: unknown[]): Promise<unknown | unknown[]> {
  logger.info({ count: items.length }, 'Calculating mode');

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Items array is required and must not be empty');
  }

  // Count occurrences
  const counts = new Map<string, { value: unknown; count: number }>();
  for (const item of items) {
    const key = JSON.stringify(item);
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { value: item, count: 1 });
    }
  }

  // Find max count
  let maxCount = 0;
  for (const { count } of counts.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }

  // Get all values with max count
  const modes: unknown[] = [];
  for (const { value, count } of counts.values()) {
    if (count === maxCount) {
      modes.push(value);
    }
  }

  const result = modes.length === 1 ? modes[0] : modes;
  logger.info({ modes: modes.length, maxCount }, 'Mode calculated');
  return result;
}

/**
 * Generate comprehensive summary statistics for a numeric field in array of objects
 *
 * @param items - Array of objects
 * @param field - Field path to analyze (supports nested paths with dot notation)
 * @returns Summary statistics object
 *
 * @example
 * const data = [
 *   { price: 100 },
 *   { price: 200 },
 *   { price: 150 }
 * ];
 * summarize(data, 'price');
 * // Returns:
 * // {
 * //   count: 3,
 * //   sum: 450,
 * //   average: 150,
 * //   min: 100,
 * //   max: 200,
 * //   median: 150,
 * //   variance: 1666.67,
 * //   stdDeviation: 40.82
 * // }
 */
async function summarizeInternal(
  items: Record<string, unknown>[],
  field: string
): Promise<SummaryStats> {
  logger.info({ count: items.length, field }, 'Generating summary statistics');

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Items array is required and must not be empty');
  }

  if (!field) {
    throw new Error('Field is required');
  }

  const numbers = extractNumbers(items, field);

  if (numbers.length === 0) {
    throw new Error(`No numeric values found for field: ${field}`);
  }

  const sum = numbers.reduce((total, n) => total + n, 0);
  const average = sum / numbers.length;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const medianValue = arrayMedian(numbers);
  const varianceValue = await varianceInternal(numbers);
  const stdDeviationValue = Math.sqrt(varianceValue);

  const result: SummaryStats = {
    count: numbers.length,
    sum,
    average,
    min,
    max,
    median: medianValue,
    variance: varianceValue,
    stdDeviation: stdDeviationValue,
  };

  logger.info(result, 'Summary statistics generated');
  return result;
}

// Create circuit breakers for all functions
const groupAndAggregateBreaker = createCircuitBreaker(
  groupAndAggregateInternal,
  { name: 'aggregation.groupAndAggregate' }
);
const percentileBreaker = createCircuitBreaker(
  percentileInternal,
  { name: 'aggregation.percentile' }
);
const medianBreaker = createCircuitBreaker(
  medianInternal,
  { name: 'aggregation.median' }
);
const varianceBreaker = createCircuitBreaker(
  varianceInternal,
  { name: 'aggregation.variance' }
);
const stdDeviationBreaker = createCircuitBreaker(
  stdDeviationInternal,
  { name: 'aggregation.stdDeviation' }
);
const modeBreaker = createCircuitBreaker(
  modeInternal,
  { name: 'aggregation.mode' }
);
const summarizeBreaker = createCircuitBreaker(
  summarizeInternal,
  { name: 'aggregation.summarize' }
);

// Export protected functions
export async function groupAndAggregate(
  items: Record<string, unknown>[],
  groupField: string,
  aggregations: Aggregation[]
): Promise<GroupResult[]> {
  return await groupAndAggregateBreaker.fire(items, groupField, aggregations);
}

export async function percentile(
  numbers: number[],
  percent: number
): Promise<number> {
  return await percentileBreaker.fire(numbers, percent);
}

export async function median(numbers: number[]): Promise<number> {
  return await medianBreaker.fire(numbers);
}

export async function variance(numbers: number[]): Promise<number> {
  return await varianceBreaker.fire(numbers);
}

export async function stdDeviation(numbers: number[]): Promise<number> {
  return await stdDeviationBreaker.fire(numbers);
}

export async function mode(items: unknown[]): Promise<unknown | unknown[]> {
  return await modeBreaker.fire(items);
}

export async function summarize(
  items: Record<string, unknown>[],
  field: string
): Promise<SummaryStats> {
  return await summarizeBreaker.fire(items, field);
}

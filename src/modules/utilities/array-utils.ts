/**
 * Array Utilities Module
 *
 * Common array manipulation functions for workflows
 * - Filtering and mapping
 * - Sorting and grouping
 * - Statistical operations
 * - Set operations
 * - Array transformations
 *
 * Perfect for:
 * - Processing API response arrays
 * - Data aggregation and analysis
 * - Deduplication and filtering
 * - Sorting and organizing data
 */

/**
 * Get first N items from array
 */
export function first<T>(arr: T[], count: number = 1): T | T[] {
  if (count === 1) return arr[0];
  return arr.slice(0, count);
}

/**
 * Get last N items from array
 */
export function last<T>(arr: T[], count: number = 1): T | T[] {
  if (count === 1) return arr[arr.length - 1];
  return arr.slice(-count);
}

/**
 * Get unique values from array
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Flatten nested arrays
 */
export function flatten<T>(arr: unknown[], depth: number = 1): T[] {
  return arr.flat(depth) as T[];
}

/**
 * Chunk array into smaller arrays of specified size
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Shuffle array randomly
 */
export function shuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get random item from array
 */
export function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get random N items from array
 */
export function sample<T>(arr: T[], count: number): T[] {
  const shuffled = shuffle(arr);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/**
 * Remove falsy values from array
 */
export function compact<T>(arr: (T | null | undefined | false | 0 | '')[]): T[] {
  return arr.filter(Boolean) as T[];
}

/**
 * Get intersection of multiple arrays
 */
export function intersection<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  return arrays.reduce((acc, arr) => acc.filter((item) => arr.includes(item)));
}

/**
 * Get union of multiple arrays (unique values from all)
 */
export function union<T>(...arrays: T[][]): T[] {
  return unique(arrays.flat());
}

/**
 * Get difference between two arrays (items in first but not in second)
 */
export function difference<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter((item) => !arr2.includes(item));
}

/**
 * Sort array of numbers
 */
export function sortNumbers(arr: number[], order: 'asc' | 'desc' = 'asc'): number[] {
  const sorted = [...arr].sort((a, b) => a - b);
  return order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Sort array of strings
 */
export function sortStrings(arr: string[], order: 'asc' | 'desc' = 'asc'): string[] {
  const sorted = [...arr].sort();
  return order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Sort array of objects by property
 */
export function sortBy<T extends Record<string, unknown>>(
  arr: T[],
  key: keyof T,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  const sorted = [...arr].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  });
  return order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Group array of objects by property
 */
export function groupBy<T extends Record<string, unknown>>(
  arr: T[],
  key: keyof T
): Record<string, T[]> {
  return arr.reduce(
    (groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Count occurrences of each value
 */
export function countBy<T>(arr: T[]): Record<string, number> {
  return arr.reduce(
    (counts, item) => {
      const key = String(item);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>
  );
}

/**
 * Get sum of numbers in array
 */
export function sum(arr: number[]): number {
  return arr.reduce((total, num) => total + num, 0);
}

/**
 * Get average of numbers in array
 */
export function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return sum(arr) / arr.length;
}

/**
 * Get minimum value
 */
export function min(arr: number[]): number {
  return Math.min(...arr);
}

/**
 * Get maximum value
 */
export function max(arr: number[]): number {
  return Math.max(...arr);
}

/**
 * Get median value
 */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = sortNumbers(arr);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Pluck property values from array of objects
 */
export function pluck<T extends Record<string, unknown>, K extends keyof T>(
  arr: T[],
  key: K
): T[K][] {
  return arr.map((item) => item[key]);
}

/**
 * Filter array by property value
 */
export function filterBy<T extends Record<string, unknown>>(
  arr: T[],
  key: keyof T,
  value: unknown
): T[] {
  return arr.filter((item) => item[key] === value);
}

/**
 * Find item by property value
 */
export function findBy<T extends Record<string, unknown>>(
  arr: T[],
  key: keyof T,
  value: unknown
): T | undefined {
  return arr.find((item) => item[key] === value);
}

/**
 * Check if array is empty
 */
export function isEmpty<T>(arr: T[]): boolean {
  return arr.length === 0;
}

/**
 * Reverse array
 */
export function reverse<T>(arr: T[]): T[] {
  return [...arr].reverse();
}

/**
 * Zip multiple arrays together
 */
export function zip<T>(...arrays: T[][]): T[][] {
  const maxLength = Math.max(...arrays.map((arr) => arr.length));
  const result: T[][] = [];
  for (let i = 0; i < maxLength; i++) {
    result.push(arrays.map((arr) => arr[i]));
  }
  return result;
}

/**
 * Zip multiple arrays into array of objects
 * @param fieldArrays - Object mapping field names to arrays of values
 * @returns Array of objects with fields populated from corresponding array values
 * @example
 * zipToObjects({
 *   id: [1, 2, 3],
 *   name: ['Alice', 'Bob', 'Carol'],
 *   age: [25, 30, 35]
 * })
 * // Returns: [
 * //   { id: 1, name: 'Alice', age: 25 },
 * //   { id: 2, name: 'Bob', age: 30 },
 * //   { id: 3, name: 'Carol', age: 35 }
 * // ]
 */
export function zipToObjects(fieldArrays: Record<string, unknown[]>): Record<string, unknown>[] {
  const fields = Object.keys(fieldArrays);
  if (fields.length === 0) return [];

  const maxLength = Math.max(...fields.map((field) => fieldArrays[field].length));
  const result: Record<string, unknown>[] = [];

  for (let i = 0; i < maxLength; i++) {
    const obj: Record<string, unknown> = {};
    for (const field of fields) {
      obj[field] = fieldArrays[field][i];
    }
    result.push(obj);
  }

  return result;
}

/**
 * Partition array into two based on predicate
 */
export function partition<T>(
  arr: T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  const truthy: T[] = [];
  const falsy: T[] = [];
  arr.forEach((item) => {
    if (predicate(item)) {
      truthy.push(item);
    } else {
      falsy.push(item);
    }
  });
  return [truthy, falsy];
}

/**
 * Remove item at index
 */
export function removeAt<T>(arr: T[], index: number): T[] {
  return [...arr.slice(0, index), ...arr.slice(index + 1)];
}

/**
 * Insert item at index
 */
export function insertAt<T>(arr: T[], index: number, item: T): T[] {
  return [...arr.slice(0, index), item, ...arr.slice(index)];
}

/**
 * Replace item at index
 */
export function replaceAt<T>(arr: T[], index: number, item: T): T[] {
  const copy = [...arr];
  copy[index] = item;
  return copy;
}

/**
 * Rotate array by N positions
 */
export function rotate<T>(arr: T[], positions: number): T[] {
  const n = positions % arr.length;
  return [...arr.slice(n), ...arr.slice(0, n)];
}

/**
 * Create range of numbers
 */
export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

/**
 * Fill array with value
 */
export function fill<T>(length: number, value: T): T[] {
  return Array(length).fill(value);
}

/**
 * Create array from repeating pattern
 */
export function repeat<T>(pattern: T[], times: number): T[] {
  return Array(times).fill(pattern).flat();
}

/**
 * Transform array by applying a module to each item
 * This is a workflow-specific function that executes a module for each array item
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function forEach<T>(_options: {
  arr: T[];
  module: string;
  inputs: Record<string, unknown>;
  itemVariable?: string;
}): Promise<unknown[]> {
  // This function is meant to be called by the workflow engine
  // which will handle the actual module execution
  // For now, we'll throw an error if called directly
  throw new Error(
    'forEach must be called through the workflow engine. ' +
    'It cannot be used directly in code.'
  );
}

/**
 * Transform array by mapping each item through a module
 * Alias for forEach with clearer semantic meaning
 */
export async function mapWithModule<T>(options: {
  arr: T[];
  module: string;
  inputs: Record<string, unknown>;
  itemVariable?: string;
}): Promise<unknown[]> {
  return forEach(options);
}

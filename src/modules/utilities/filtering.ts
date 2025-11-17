import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';

/**
 * Filtering Utilities Module
 *
 * Declarative filter/find functions for working with arrays and data
 * - Filter arrays by conditions (>, <, =, !=, contains, startsWith, endsWith)
 * - Find first matching item
 * - Check array containment (all/any)
 * - Pattern matching
 * - Multi-condition filtering with AND/OR logic
 *
 * Perfect for:
 * - Filtering workflow data
 * - Finding specific items in collections
 * - Conditional data processing
 * - Data validation and matching
 */

/**
 * Supported comparison operators
 */
export type FilterOperator =
  | '>' // Greater than
  | '<' // Less than
  | '=' // Equal
  | '==' // Equal (alias)
  | '!=' // Not equal
  | 'contains' // String/array contains
  | 'startsWith' // String starts with
  | 'endsWith' // String ends with
  | 'gt' // Greater than (alias)
  | 'lt' // Less than (alias)
  | 'gte' // Greater than or equal
  | 'lte' // Less than or equal
  | 'eq' // Equal (alias)
  | 'ne'; // Not equal (alias)

/**
 * Condition for filtering
 */
export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/**
 * Multi-condition filter options
 */
export interface MultiFilterOptions {
  conditions: FilterCondition[];
  logic?: 'AND' | 'OR'; // Default: AND
}

/**
 * Internal function to get nested field value from object
 */
function getFieldValue(obj: unknown, field: string): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return undefined;
  }

  const keys = field.split('.');
  let value: unknown = obj;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Internal function to compare values based on operator
 */
function compareValues(
  fieldValue: unknown,
  operator: FilterOperator,
  compareValue: unknown
): boolean {
  // Handle null/undefined
  if (fieldValue === null || fieldValue === undefined) {
    return operator === '!=' || operator === 'ne';
  }

  switch (operator) {
    case '>':
    case 'gt':
      return Number(fieldValue) > Number(compareValue);

    case '<':
    case 'lt':
      return Number(fieldValue) < Number(compareValue);

    case 'gte':
      return Number(fieldValue) >= Number(compareValue);

    case 'lte':
      return Number(fieldValue) <= Number(compareValue);

    case '=':
    case '==':
    case 'eq':
      return fieldValue === compareValue;

    case '!=':
    case 'ne':
      return fieldValue !== compareValue;

    case 'contains':
      if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
        return fieldValue.includes(compareValue);
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(compareValue);
      }
      return false;

    case 'startsWith':
      if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
        return fieldValue.startsWith(compareValue);
      }
      return false;

    case 'endsWith':
      if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
        return fieldValue.endsWith(compareValue);
      }
      return false;

    default:
      return false;
  }
}

/**
 * Filter array by condition
 * @param items - Array to filter
 * @param field - Field to check (supports nested paths like 'user.name')
 * @param operator - Comparison operator
 * @param value - Value to compare against
 * @returns Filtered array
 * @example
 * filterArrayByCondition([{age: 25}, {age: 30}], 'age', '>', 26) → [{age: 30}]
 * filterArrayByCondition([{name: 'John'}, {name: 'Jane'}], 'name', 'startsWith', 'J') → [{name: 'John'}, {name: 'Jane'}]
 */
async function filterArrayByConditionInternal<T = unknown>(
  items: T[],
  field: string,
  operator: FilterOperator,
  value: unknown
): Promise<T[]> {
  logger.info(
    {
      itemCount: items.length,
      field,
      operator,
      value,
    },
    'Filtering array by condition'
  );

  if (!Array.isArray(items)) {
    throw new Error('First argument must be an array');
  }

  const filtered = items.filter((item) => {
    const fieldValue = getFieldValue(item, field);
    return compareValues(fieldValue, operator, value);
  });

  logger.info(
    {
      originalCount: items.length,
      filteredCount: filtered.length,
    },
    'Array filtered successfully'
  );

  return filtered;
}

const filterArrayByConditionBreaker = createCircuitBreaker(
  filterArrayByConditionInternal,
  {
    timeout: 5000,
    name: 'filter-array-by-condition',
  }
);

export async function filterArrayByCondition<T = unknown>(
  items: T[],
  field: string,
  operator: FilterOperator,
  value: unknown
): Promise<T[]> {
  return await filterArrayByConditionBreaker.fire(items, field, operator, value) as T[];
}

/**
 * Find first item matching condition
 * @param items - Array to search
 * @param field - Field to check
 * @param operator - Comparison operator
 * @param value - Value to compare against
 * @returns First matching item or null
 * @example
 * findItemByCondition([{id: 1}, {id: 2}], 'id', '=', 2) → {id: 2}
 * findItemByCondition([{name: 'Test'}], 'name', 'contains', 'es') → {name: 'Test'}
 */
async function findItemByConditionInternal<T = unknown>(
  items: T[],
  field: string,
  operator: FilterOperator,
  value: unknown
): Promise<T | null> {
  logger.info(
    {
      itemCount: items.length,
      field,
      operator,
      value,
    },
    'Finding item by condition'
  );

  if (!Array.isArray(items)) {
    throw new Error('First argument must be an array');
  }

  for (const item of items) {
    const fieldValue = getFieldValue(item, field);
    if (compareValues(fieldValue, operator, value)) {
      logger.info('Item found');
      return item;
    }
  }

  logger.info('No matching item found');
  return null;
}

const findItemByConditionBreaker = createCircuitBreaker(
  findItemByConditionInternal,
  {
    timeout: 5000,
    name: 'find-item-by-condition',
  }
);

export async function findItemByCondition<T = unknown>(
  items: T[],
  field: string,
  operator: FilterOperator,
  value: unknown
): Promise<T | null> {
  return await findItemByConditionBreaker.fire(items, field, operator, value) as T | null;
}

/**
 * Check if array contains all specified values
 * @param array - Array to check
 * @param searchValues - Values to search for
 * @returns True if array contains all values
 * @example
 * containsAll([1, 2, 3, 4], [2, 3]) → true
 * containsAll(['a', 'b'], ['a', 'c']) → false
 */
async function containsAllInternal(
  array: unknown[],
  searchValues: unknown[]
): Promise<boolean> {
  logger.info(
    {
      arrayLength: array.length,
      searchValuesCount: searchValues.length,
    },
    'Checking if array contains all values'
  );

  if (!Array.isArray(array)) {
    throw new Error('First argument must be an array');
  }

  if (!Array.isArray(searchValues)) {
    throw new Error('Second argument must be an array');
  }

  const result = searchValues.every((value) => array.includes(value));

  logger.info({ result }, 'Contains all check complete');
  return result;
}

const containsAllBreaker = createCircuitBreaker(containsAllInternal, {
  timeout: 5000,
  name: 'contains-all',
});

export async function containsAll(
  array: unknown[],
  searchValues: unknown[]
): Promise<boolean> {
  return containsAllBreaker.fire(array, searchValues);
}

/**
 * Check if array contains any of the specified values
 * @param array - Array to check
 * @param searchValues - Values to search for
 * @returns True if array contains at least one value
 * @example
 * containsAny([1, 2, 3], [3, 4]) → true
 * containsAny(['a', 'b'], ['c', 'd']) → false
 */
async function containsAnyInternal(
  array: unknown[],
  searchValues: unknown[]
): Promise<boolean> {
  logger.info(
    {
      arrayLength: array.length,
      searchValuesCount: searchValues.length,
    },
    'Checking if array contains any values'
  );

  if (!Array.isArray(array)) {
    throw new Error('First argument must be an array');
  }

  if (!Array.isArray(searchValues)) {
    throw new Error('Second argument must be an array');
  }

  const result = searchValues.some((value) => array.includes(value));

  logger.info({ result }, 'Contains any check complete');
  return result;
}

const containsAnyBreaker = createCircuitBreaker(containsAnyInternal, {
  timeout: 5000,
  name: 'contains-any',
});

export async function containsAny(
  array: unknown[],
  searchValues: unknown[]
): Promise<boolean> {
  return containsAnyBreaker.fire(array, searchValues);
}

/**
 * Pattern matching helper for text
 * @param text - Text to match against
 * @param pattern - Pattern to match (can be string or regex pattern)
 * @param caseSensitive - Whether matching is case sensitive (default: false)
 * @returns True if pattern matches
 * @example
 * textMatches('Hello World', 'hello', false) → true
 * textMatches('test@example.com', '^[^@]+@[^@]+\\.[^@]+$', true) → true (regex)
 */
async function textMatchesInternal(
  text: string,
  pattern: string,
  caseSensitive: boolean = false
): Promise<boolean> {
  logger.info(
    {
      textLength: text.length,
      pattern,
      caseSensitive,
    },
    'Matching text pattern'
  );

  if (typeof text !== 'string') {
    throw new Error('First argument must be a string');
  }

  if (typeof pattern !== 'string') {
    throw new Error('Second argument must be a string');
  }

  try {
    // Try to use pattern as regex
    const flags = caseSensitive ? '' : 'i';
    const regex = new RegExp(pattern, flags);
    const result = regex.test(text);

    logger.info({ result }, 'Pattern match complete');
    return result;
  } catch {
    // If pattern is not valid regex, do simple string matching
    logger.info('Pattern not valid regex, using simple string match');
    const result = caseSensitive
      ? text.includes(pattern)
      : text.toLowerCase().includes(pattern.toLowerCase());

    logger.info({ result }, 'Simple string match complete');
    return result;
  }
}

const textMatchesBreaker = createCircuitBreaker(textMatchesInternal, {
  timeout: 5000,
  name: 'text-matches',
});

export async function textMatches(
  text: string,
  pattern: string,
  caseSensitive: boolean = false
): Promise<boolean> {
  return textMatchesBreaker.fire(text, pattern, caseSensitive);
}

/**
 * Filter array by multiple conditions with AND/OR logic
 * @param items - Array to filter
 * @param options - Filter options with conditions and logic
 * @returns Filtered array
 * @example
 * filterByMultiple([{age: 25, name: 'John'}, {age: 30, name: 'Jane'}], {
 *   conditions: [
 *     { field: 'age', operator: '>', value: 20 },
 *     { field: 'name', operator: 'startsWith', value: 'J' }
 *   ],
 *   logic: 'AND'
 * }) → [{age: 25, name: 'John'}, {age: 30, name: 'Jane'}]
 */
async function filterByMultipleInternal<T = unknown>(
  items: T[],
  options: MultiFilterOptions
): Promise<T[]> {
  const { conditions, logic = 'AND' } = options;

  logger.info(
    {
      itemCount: items.length,
      conditionCount: conditions.length,
      logic,
    },
    'Filtering by multiple conditions'
  );

  if (!Array.isArray(items)) {
    throw new Error('First argument must be an array');
  }

  if (!Array.isArray(conditions) || conditions.length === 0) {
    throw new Error('Conditions must be a non-empty array');
  }

  const filtered = items.filter((item) => {
    const results = conditions.map((condition) => {
      const fieldValue = getFieldValue(item, condition.field);
      return compareValues(fieldValue, condition.operator, condition.value);
    });

    // Apply AND/OR logic
    const match =
      logic === 'AND'
        ? results.every((result) => result === true)
        : results.some((result) => result === true);

    return match;
  });

  logger.info(
    {
      originalCount: items.length,
      filteredCount: filtered.length,
    },
    'Multi-condition filter complete'
  );

  return filtered;
}

const filterByMultipleBreaker = createCircuitBreaker(filterByMultipleInternal, {
  timeout: 5000,
  name: 'filter-by-multiple',
});

export async function filterByMultiple<T = unknown>(
  items: T[],
  options: MultiFilterOptions
): Promise<T[]> {
  return await filterByMultipleBreaker.fire(items, options) as T[];
}

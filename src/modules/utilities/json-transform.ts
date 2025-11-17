import { JSONPath } from 'jsonpath-plus';

/**
 * JSON Transformation Module
 *
 * Query, transform, and validate JSON data
 * - JSONPath queries for extracting data
 * - Deep merge and clone
 * - Schema validation helpers
 * - Type-safe transformations
 *
 * Perfect for:
 * - Extracting specific fields from API responses
 * - Transforming data between services
 * - Mapping complex JSON structures
 * - Data validation in workflows
 */

/**
 * Query JSON using JSONPath
 * @param data - JSON data to query
 * @param path - JSONPath expression (e.g., '$.users[*].name')
 * @returns Matched values
 */
export function queryJson<T = unknown>(data: unknown, path: string): T[] {
  const result = JSONPath({ path, json: data as object });
  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * Get first match from JSONPath query
 */
export function queryJsonFirst<T = unknown>(data: unknown, path: string): T | undefined {
  const results = queryJson<T>(data, path);
  return results[0];
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (!sources.length) return target;

  const source = sources.shift();
  if (!source) return target;

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (isObject(sourceValue) && isObject(targetValue)) {
      target[key] = deepMerge(
        { ...targetValue } as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      target[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Get value from nested object using dot notation
 * @example get({ user: { name: 'John' } }, 'user.name') => 'John'
 */
export function get<T = unknown>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | undefined {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }

  return result as T;
}

/**
 * Set value in nested object using dot notation
 * @example set({}, 'user.name', 'John') => { user: { name: 'John' } }
 */
export function set<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown
): T {
  const keys = path.split('.');
  const lastKey = keys.pop();

  if (!lastKey) return obj;

  let current: Record<string, unknown> = obj;

  for (const key of keys) {
    if (!(key in current) || !isObject(current[key])) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[lastKey] = value;
  return obj;
}

/**
 * Pick specific keys from object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;

  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }

  return result;
}

/**
 * Omit specific keys from object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };

  for (const key of keys) {
    delete result[key];
  }

  return result;
}

/**
 * Map object keys
 */
export function mapKeys<T extends Record<string, unknown>>(
  obj: T,
  mapper: (key: string, value: unknown) => string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    result[mapper(key, value)] = value;
  }

  return result;
}

/**
 * Map object values
 */
export function mapValues<T extends Record<string, unknown>, R>(
  obj: T,
  mapper: (value: unknown, key: string) => R
): Record<keyof T, R> {
  const result = {} as Record<keyof T, R>;

  for (const [key, value] of Object.entries(obj)) {
    result[key as keyof T] = mapper(value, key);
  }

  return result;
}

/**
 * Filter object by predicate
 */
export function filterObject<T extends Record<string, unknown>>(
  obj: T,
  predicate: (value: unknown, key: string) => boolean
): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) {
      result[key as keyof T] = value as T[keyof T];
    }
  }

  return result;
}

/**
 * Flatten nested object to dot notation
 * @example flatten({ a: { b: { c: 1 } } }) => { 'a.b.c': 1 }
 */
export function flatten(
  obj: Record<string, unknown>,
  separator: string = '.',
  prefix: string = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}${separator}${key}` : key;

    if (isObject(value) && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, separator, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * Unflatten dot notation object to nested
 * @example unflatten({ 'a.b.c': 1 }) => { a: { b: { c: 1 } } }
 */
export function unflatten(
  obj: Record<string, unknown>,
  separator: string = '.'
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(obj)) {
    const keys = path.split(separator);
    const lastKey = keys.pop();

    if (!lastKey) continue;

    let current: Record<string, unknown> = result;

    for (const key of keys) {
      if (!(key in current) || !isObject(current[key])) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[lastKey] = value;
  }

  return result;
}

/**
 * Check if value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safe JSON parse with fallback
 */
export function parseJson<T = unknown>(
  jsonString: string,
  fallback?: T
): T | undefined {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safe JSON stringify
 */
export function stringifyJson(
  data: unknown,
  pretty: boolean = false
): string {
  try {
    return JSON.stringify(data, null, pretty ? 2 : 0);
  } catch (error) {
    throw new Error(`Failed to stringify JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete value from nested object using dot notation
 * @example deleteNestedValue({ user: { name: 'John', age: 30 } }, 'user.age') => { user: { name: 'John' } }
 */
export function deleteNestedValue<T extends Record<string, unknown>>(
  obj: T,
  path: string
): T {
  const keys = path.split('.');
  const lastKey = keys.pop();

  if (!lastKey) return obj;

  let current: Record<string, unknown> = obj;

  for (const key of keys) {
    if (!(key in current) || !isObject(current[key])) {
      return obj; // Path doesn't exist, nothing to delete
    }
    current = current[key] as Record<string, unknown>;
  }

  delete current[lastKey];
  return obj;
}

// Alias exports for consistency with module registry
export { get as getNestedValue };
export { set as setNestedValue };
export { flatten as flattenObject };
export { unflatten as unflattenObject };

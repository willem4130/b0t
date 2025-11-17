import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';

/**
 * Data Transformation Module
 *
 * Transform and reshape data structures in workflows
 * - Rename fields across multiple objects
 * - Select/filter specific fields
 * - Type casting and conversion
 * - Merge and split fields
 * - Default values and null handling
 *
 * Perfect for:
 * - Normalizing API responses
 * - Preparing data for databases
 * - Transforming between different schemas
 * - Cleaning and validating data
 */

// Circuit breaker options
const breakerOptions = {
  timeout: 10000, // 10 seconds
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

/**
 * Type map for casting operations
 */
export type TypeCastMap = Record<string, 'string' | 'number' | 'boolean' | 'date' | 'json'>;

/**
 * Field mapping for rename operations
 */
export type FieldMap = Record<string, string>;

/**
 * Default values map
 */
export type DefaultsMap = Record<string, unknown>;

/**
 * Rename multiple fields at once
 * @param items - Array of objects to transform
 * @param fieldMap - Map of old field names to new field names
 * @returns Transformed array with renamed fields
 * @example renameFields([{oldName: "John"}], {oldName: "newName"}) → [{newName: "John"}]
 */
export async function renameFields<T extends Record<string, unknown>>(
  items: T[],
  fieldMap: FieldMap
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[], mapping: FieldMap) => {
      logger.info({ fieldMap: mapping, count: data.length }, 'Renaming fields');

      return data.map((item) => {
        const result: Record<string, unknown> = { ...item };

        for (const [oldKey, newKey] of Object.entries(mapping)) {
          if (oldKey in result) {
            result[newKey] = result[oldKey];
            delete result[oldKey];
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items, fieldMap);
}

/**
 * Select only specified fields from objects
 * @param items - Array of objects
 * @param fields - Array of field names to keep
 * @returns Array with only selected fields
 * @example selectFields([{id: 1, name: "John", age: 30}], ["id", "name"]) → [{id: 1, name: "John"}]
 */
export async function selectFields<T extends Record<string, unknown>>(
  items: T[],
  fields: string[]
): Promise<Partial<T>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[], selectedFields: string[]) => {
      logger.info({ fields: selectedFields, count: data.length }, 'Selecting fields');

      return data.map((item) => {
        const result: Partial<T> = {};

        for (const field of selectedFields) {
          if (field in item) {
            result[field as keyof T] = item[field as keyof T];
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items, fields);
}

/**
 * Cast field types (string→number, etc.)
 * @param items - Array of objects
 * @param typeMap - Map of field names to target types
 * @returns Array with cast types
 * @example castTypes([{age: "30"}], {age: "number"}) → [{age: 30}]
 */
export async function castTypes<T extends Record<string, unknown>>(
  items: T[],
  typeMap: TypeCastMap
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[], casting: TypeCastMap) => {
      logger.info({ typeMap: casting, count: data.length }, 'Casting types');

      return data.map((item) => {
        const result: Record<string, unknown> = { ...item };

        for (const [field, targetType] of Object.entries(casting)) {
          if (field in result && result[field] !== null && result[field] !== undefined) {
            const value = result[field];

            try {
              switch (targetType) {
                case 'string':
                  result[field] = String(value);
                  break;
                case 'number':
                  const num = Number(value);
                  result[field] = isNaN(num) ? value : num;
                  break;
                case 'boolean':
                  if (typeof value === 'string') {
                    result[field] = value.toLowerCase() === 'true' || value === '1';
                  } else {
                    result[field] = Boolean(value);
                  }
                  break;
                case 'date':
                  result[field] = new Date(value as string | number | Date);
                  break;
                case 'json':
                  if (typeof value === 'string') {
                    result[field] = JSON.parse(value);
                  }
                  break;
                default:
                  logger.warn({ field, targetType }, 'Unknown type for casting');
              }
            } catch (error) {
              logger.warn(
                {
                  field,
                  targetType,
                  value,
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to cast type'
              );
            }
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items, typeMap);
}

/**
 * Merge multiple fields into one
 * @param items - Array of objects
 * @param sourceFields - Array of field names to merge
 * @param destField - Destination field name
 * @param separator - Separator string (default: space)
 * @returns Array with merged fields
 * @example mergeFields([{first: "John", last: "Doe"}], ["first", "last"], "fullName", " ") → [{first: "John", last: "Doe", fullName: "John Doe"}]
 */
export async function mergeFields<T extends Record<string, unknown>>(
  items: T[],
  sourceFields: string[],
  destField: string,
  separator: string = ' '
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (
      data: T[],
      sources: string[],
      dest: string,
      sep: string
    ) => {
      logger.info(
        {
          sourceFields: sources,
          destField: dest,
          separator: sep,
          count: data.length,
        },
        'Merging fields'
      );

      return data.map((item) => {
        const result: Record<string, unknown> = { ...item };

        const values = sources
          .map((field) => {
            const value = result[field];
            return value !== null && value !== undefined ? String(value) : '';
          })
          .filter((v) => v !== '');

        result[dest] = values.join(sep);

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items, sourceFields, destField, separator);
}

/**
 * Split a field into multiple fields
 * @param items - Array of objects
 * @param field - Field name to split
 * @param delimiter - Delimiter to split by
 * @param newFields - Array of new field names for split values
 * @returns Array with split fields
 * @example splitField([{fullName: "John Doe"}], "fullName", " ", ["first", "last"]) → [{fullName: "John Doe", first: "John", last: "Doe"}]
 */
export async function splitField<T extends Record<string, unknown>>(
  items: T[],
  field: string,
  delimiter: string,
  newFields: string[]
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (
      data: T[],
      sourceField: string,
      delim: string,
      targets: string[]
    ) => {
      logger.info(
        {
          field: sourceField,
          delimiter: delim,
          newFields: targets,
          count: data.length,
        },
        'Splitting field'
      );

      return data.map((item) => {
        const result: Record<string, unknown> = { ...item };

        if (sourceField in result) {
          const value = result[sourceField];
          if (value !== null && value !== undefined) {
            const parts = String(value).split(delim);

            targets.forEach((targetField, index) => {
              result[targetField] = parts[index] || '';
            });
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items, field, delimiter, newFields);
}

/**
 * Fill in default values for missing fields
 * @param items - Array of objects
 * @param defaults - Map of field names to default values
 * @returns Array with default values applied
 * @example defaultValues([{name: "John"}], {name: "Unknown", age: 0}) → [{name: "John", age: 0}]
 */
export async function defaultValues<T extends Record<string, unknown>>(
  items: T[],
  defaults: DefaultsMap
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[], defaultMap: DefaultsMap) => {
      logger.info({ defaults: defaultMap, count: data.length }, 'Applying default values');

      return data.map((item) => {
        const result: Record<string, unknown> = { ...item };

        for (const [field, defaultValue] of Object.entries(defaultMap)) {
          if (!(field in result) || result[field] === null || result[field] === undefined) {
            result[field] = defaultValue;
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items, defaults);
}

/**
 * Remove null and undefined values from objects
 * @param items - Array of objects
 * @returns Array with null/undefined values removed
 * @example removeNulls([{a: 1, b: null, c: undefined, d: 0}]) → [{a: 1, d: 0}]
 */
export async function removeNulls<T extends Record<string, unknown>>(
  items: T[]
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[]) => {
      logger.info({ count: data.length }, 'Removing null/undefined values');

      return data.map((item) => {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(item)) {
          if (value !== null && value !== undefined) {
            result[key] = value;
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items);
}

/**
 * Remove empty strings from objects
 * @param items - Array of objects
 * @returns Array with empty strings removed
 * @example removeEmptyStrings([{a: "hello", b: "", c: "world"}]) → [{a: "hello", c: "world"}]
 */
export async function removeEmptyStrings<T extends Record<string, unknown>>(
  items: T[]
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[]) => {
      logger.info({ count: data.length }, 'Removing empty strings');

      return data.map((item) => {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(item)) {
          if (value !== '') {
            result[key] = value;
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items);
}

/**
 * Trim whitespace from all string fields
 * @param items - Array of objects
 * @returns Array with trimmed strings
 * @example trimStrings([{name: "  John  ", age: 30}]) → [{name: "John", age: 30}]
 */
export async function trimStrings<T extends Record<string, unknown>>(
  items: T[]
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[]) => {
      logger.info({ count: data.length }, 'Trimming strings');

      return data.map((item) => {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(item)) {
          result[key] = typeof value === 'string' ? value.trim() : value;
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items);
}

/**
 * Flatten nested objects to dot notation
 * @param items - Array of nested objects
 * @param maxDepth - Maximum depth to flatten (default: Infinity)
 * @returns Array with flattened objects
 * @example flattenObjects([{user: {name: "John", age: 30}}]) → [{"user.name": "John", "user.age": 30}]
 */
export async function flattenObjects<T extends Record<string, unknown>>(
  items: T[],
  maxDepth: number = Infinity
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[], depth: number) => {
      logger.info({ maxDepth: depth, count: data.length }, 'Flattening objects');

      const flattenRecursive = (
        obj: Record<string, unknown>,
        prefix: string = '',
        currentDepth: number = 0
      ): Record<string, unknown> => {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
          const newKey = prefix ? `${prefix}.${key}` : key;

          if (
            currentDepth < depth &&
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            !(value instanceof Date)
          ) {
            Object.assign(
              result,
              flattenRecursive(value as Record<string, unknown>, newKey, currentDepth + 1)
            );
          } else {
            result[newKey] = value;
          }
        }

        return result;
      };

      return data.map((item) => flattenRecursive(item));
    },
    breakerOptions
  );

  return breaker.fire(items, maxDepth);
}

/**
 * Unflatten dot notation to nested objects
 * @param items - Array of flattened objects
 * @returns Array with nested objects
 * @example unflattenObjects([{"user.name": "John", "user.age": 30}]) → [{user: {name: "John", age: 30}}]
 */
export async function unflattenObjects<T extends Record<string, unknown>>(
  items: T[]
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[]) => {
      logger.info({ count: data.length }, 'Unflattening objects');

      const unflattenSingle = (obj: Record<string, unknown>): Record<string, unknown> => {
        const result: Record<string, unknown> = {};

        for (const [path, value] of Object.entries(obj)) {
          const keys = path.split('.');
          let current = result;

          for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
              current[key] = {};
            }
            current = current[key] as Record<string, unknown>;
          }

          current[keys[keys.length - 1]] = value;
        }

        return result;
      };

      return data.map((item) => unflattenSingle(item));
    },
    breakerOptions
  );

  return breaker.fire(items);
}

/**
 * Map values based on a mapping object
 * @param items - Array of objects
 * @param field - Field name to map
 * @param valueMap - Map of old values to new values
 * @returns Array with mapped values
 * @example mapFieldValues([{status: "active"}], "status", {active: "enabled", inactive: "disabled"}) → [{status: "enabled"}]
 */
export async function mapFieldValues<T extends Record<string, unknown>>(
  items: T[],
  field: string,
  valueMap: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const breaker = new CircuitBreaker(
    async (data: T[], fieldName: string, mapping: Record<string, unknown>) => {
      logger.info({ field: fieldName, count: data.length }, 'Mapping field values');

      return data.map((item) => {
        const result: Record<string, unknown> = { ...item };

        if (fieldName in result) {
          const currentValue = String(result[fieldName]);
          if (currentValue in mapping) {
            result[fieldName] = mapping[currentValue];
          }
        }

        return result;
      });
    },
    breakerOptions
  );

  return breaker.fire(items, field, valueMap);
}

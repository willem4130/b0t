import { logger } from '@/lib/logger';

/**
 * Deduplication Module
 *
 * Generic in-memory deduplication functions for workflows to track and filter
 * already-processed items.
 */

/**
 * In-Memory Deduplication Functions
 *
 * These functions perform deduplication on arrays of objects in memory,
 * without requiring database access.
 */

export async function deduplicateBy<T extends Record<string, unknown>>(params: {
  items: T[];
  field: string;
}): Promise<T[]> {
  const { items, field } = params;

  if (!items || items.length === 0) {
    return [];
  }

  logger.info({ count: items.length, field }, 'Deduplicating items by field');

  const seen = new Set<unknown>();
  const unique: T[] = [];

  for (const item of items) {
    const value = item[field];

    if (!seen.has(value)) {
      seen.add(value);
      unique.push(item);
    }
  }

  logger.info(
    {
      originalCount: items.length,
      uniqueCount: unique.length,
      duplicatesRemoved: items.length - unique.length,
    },
    'Deduplication by field complete'
  );

  return unique;
}

export async function deduplicateByMultiple<T extends Record<string, unknown>>(params: {
  items: T[];
  fields: string[];
}): Promise<T[]> {
  const { items, fields } = params;

  if (!items || items.length === 0) {
    return [];
  }

  if (!fields || fields.length === 0) {
    throw new Error('At least one field must be specified for deduplication');
  }

  logger.info({ count: items.length, fields }, 'Deduplicating items by multiple fields');

  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    // Create composite key from all fields
    const keyParts = fields.map(field => {
      const value = item[field];
      return value === null || value === undefined ? 'null' : String(value);
    });
    const compositeKey = keyParts.join('|');

    if (!seen.has(compositeKey)) {
      seen.add(compositeKey);
      unique.push(item);
    }
  }

  logger.info(
    {
      originalCount: items.length,
      uniqueCount: unique.length,
      duplicatesRemoved: items.length - unique.length,
    },
    'Deduplication by multiple fields complete'
  );

  return unique;
}

export async function findDuplicates<T extends Record<string, unknown>>(params: {
  items: T[];
  field: string;
}): Promise<T[]> {
  const { items, field } = params;

  if (!items || items.length === 0) {
    return [];
  }

  logger.info({ count: items.length, field }, 'Finding duplicate items by field');

  const valueToItems = new Map<unknown, T[]>();

  // Group items by field value
  for (const item of items) {
    const value = item[field];

    if (!valueToItems.has(value)) {
      valueToItems.set(value, []);
    }
    valueToItems.get(value)!.push(item);
  }

  // Collect items that appear more than once
  const duplicates: T[] = [];
  for (const items of valueToItems.values()) {
    if (items.length > 1) {
      duplicates.push(...items);
    }
  }

  logger.info(
    {
      totalItems: items.length,
      duplicateItems: duplicates.length,
      uniqueValues: valueToItems.size,
    },
    'Find duplicates complete'
  );

  return duplicates;
}

export async function excludeByIds<T extends Record<string, unknown>>(params: {
  items: T[];
  excludeIds: unknown[];
  idField: string;
}): Promise<T[]> {
  const { items, excludeIds, idField } = params;

  if (!items || items.length === 0) {
    return [];
  }

  if (!excludeIds || excludeIds.length === 0) {
    return items;
  }

  logger.info(
    { itemCount: items.length, excludeCount: excludeIds.length, idField },
    'Excluding items by ID list'
  );

  const excludeSet = new Set(excludeIds);
  const filtered = items.filter(item => !excludeSet.has(item[idField]));

  logger.info(
    {
      originalCount: items.length,
      excludedCount: items.length - filtered.length,
      remainingCount: filtered.length,
    },
    'Exclude by IDs complete'
  );

  return filtered;
}

export async function uniqueValues<T extends Record<string, unknown>>(params: {
  items: T[];
  field: string;
}): Promise<unknown[]> {
  const { items, field } = params;

  if (!items || items.length === 0) {
    return [];
  }

  logger.info({ count: items.length, field }, 'Extracting unique values for field');

  const values = new Set<unknown>();

  for (const item of items) {
    values.add(item[field]);
  }

  const uniqueArray = Array.from(values);

  logger.info(
    {
      totalItems: items.length,
      uniqueValues: uniqueArray.length,
    },
    'Unique values extraction complete'
  );

  return uniqueArray;
}

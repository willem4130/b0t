import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { logger } from '@/lib/logger';

/**
 * CSV Module
 *
 * Parse and generate CSV files
 * - Parse CSV strings to objects
 * - Generate CSV from objects
 * - Handle headers and custom delimiters
 * - Type-safe transformations
 *
 * Perfect for:
 * - Data import/export
 * - Report generation
 * - Spreadsheet automation
 * - Data transformation
 */

export interface CsvParseOptions {
  columns?: boolean | string[];
  delimiter?: string;
  skip_empty_lines?: boolean;
  trim?: boolean;
  from_line?: number;
}

export interface CsvStringifyOptions {
  header?: boolean;
  columns?: string[] | { key: string; header?: string }[];
  delimiter?: string;
}

/**
 * Parse CSV string to array of objects
 */
export function parseCsv<T = Record<string, string>>(
  csvString: string,
  options?: CsvParseOptions
): T[] {
  logger.info(
    {
      length: csvString.length,
      hasOptions: !!options,
    },
    'Parsing CSV'
  );

  try {
    const records = parse(csvString, {
      columns: options?.columns !== undefined ? options.columns : true,
      delimiter: options?.delimiter || ',',
      skip_empty_lines: options?.skip_empty_lines !== false,
      trim: options?.trim !== false,
      from_line: options?.from_line,
    });

    logger.info({ recordCount: records.length }, 'CSV parsed successfully');

    return records as T[];
  } catch (error) {
    logger.error({ error }, 'Failed to parse CSV');
    throw new Error(
      `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate CSV string from array of objects
 */
export function stringifyCsv<T = Record<string, unknown>>(
  data: T[],
  options?: CsvStringifyOptions
): string {
  logger.info(
    {
      recordCount: data.length,
      hasOptions: !!options,
    },
    'Generating CSV'
  );

  try {
    const csv = stringify(data, {
      header: options?.header !== false,
      columns: options?.columns as never,
      delimiter: options?.delimiter || ',',
    });

    logger.info({ csvLength: csv.length }, 'CSV generated successfully');

    return csv;
  } catch (error) {
    logger.error({ error }, 'Failed to generate CSV');
    throw new Error(
      `Failed to generate CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse CSV with custom transformations
 */
export function parseCsvWithTransform<T = Record<string, unknown>>(
  csvString: string,
  transform: (record: Record<string, string>) => T,
  options?: CsvParseOptions
): T[] {
  logger.info('Parsing CSV with transformations');

  const records = parseCsv<Record<string, string>>(csvString, options);
  const transformed = records.map(transform);

  logger.info({ recordCount: transformed.length }, 'CSV parsed and transformed');

  return transformed;
}

/**
 * Filter CSV data
 */
export function filterCsv<T = Record<string, unknown>>(
  data: T[],
  predicate: (record: T) => boolean
): T[] {
  logger.info({ inputCount: data.length }, 'Filtering CSV data');

  const filtered = data.filter(predicate);

  logger.info(
    { inputCount: data.length, outputCount: filtered.length },
    'CSV data filtered'
  );

  return filtered;
}

/**
 * Map CSV columns
 */
export function mapCsvColumns<T = Record<string, unknown>>(
  data: Record<string, unknown>[],
  columnMap: Record<string, string>
): T[] {
  logger.info({ recordCount: data.length }, 'Mapping CSV columns');

  const mapped = data.map((record) => {
    const newRecord: Record<string, unknown> = {};

    for (const [oldKey, newKey] of Object.entries(columnMap)) {
      if (oldKey in record) {
        newRecord[newKey] = record[oldKey];
      }
    }

    // Include any unmapped columns
    for (const [key, value] of Object.entries(record)) {
      if (!(key in columnMap)) {
        newRecord[key] = value;
      }
    }

    return newRecord as T;
  });

  logger.info('CSV columns mapped');

  return mapped;
}

/**
 * Select specific CSV columns
 */
export function selectCsvColumns<T = Record<string, unknown>>(
  data: Record<string, unknown>[],
  columns: string[]
): T[] {
  logger.info({ recordCount: data.length, columnCount: columns.length }, 'Selecting CSV columns');

  const selected = data.map((record) => {
    const newRecord: Record<string, unknown> = {};

    for (const column of columns) {
      if (column in record) {
        newRecord[column] = record[column];
      }
    }

    return newRecord as T;
  });

  logger.info('CSV columns selected');

  return selected;
}

/**
 * Sort CSV data
 */
export function sortCsv<T extends Record<string, unknown>>(
  data: T[],
  sortKey: keyof T,
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  logger.info({ recordCount: data.length, sortKey: String(sortKey), direction }, 'Sorting CSV data');

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (aVal === bVal) return 0;

    let comparison = 0;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return direction === 'asc' ? comparison : -comparison;
  });

  logger.info('CSV data sorted');

  return sorted;
}

/**
 * Group CSV data by key
 */
export function groupCsvBy<T extends Record<string, unknown>>(
  data: T[],
  groupKey: keyof T
): Record<string, T[]> {
  logger.info({ recordCount: data.length, groupKey: String(groupKey) }, 'Grouping CSV data');

  const grouped: Record<string, T[]> = {};

  for (const record of data) {
    const key = String(record[groupKey]);
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(record);
  }

  logger.info({ groupCount: Object.keys(grouped).length }, 'CSV data grouped');

  return grouped;
}

/**
 * Convert CSV to JSON
 */
export function csvToJson<T = Record<string, unknown>>(
  csvString: string,
  options?: CsvParseOptions
): string {
  logger.info('Converting CSV to JSON');

  const data = parseCsv<T>(csvString, options);
  const json = JSON.stringify(data, null, 2);

  logger.info({ recordCount: data.length }, 'CSV converted to JSON');

  return json;
}

/**
 * Convert JSON to CSV
 */
export function jsonToCsv(
  jsonString: string,
  options?: CsvStringifyOptions
): string {
  logger.info('Converting JSON to CSV');

  try {
    const data = JSON.parse(jsonString);

    if (!Array.isArray(data)) {
      throw new Error('JSON must be an array of objects');
    }

    const csv = stringifyCsv(data, options);

    logger.info({ recordCount: data.length }, 'JSON converted to CSV');

    return csv;
  } catch (error) {
    logger.error({ error }, 'Failed to convert JSON to CSV');
    throw new Error(
      `Failed to convert JSON to CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

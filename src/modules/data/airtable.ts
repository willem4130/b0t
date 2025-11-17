import Airtable, { FieldSet, Records } from 'airtable';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Airtable Module
 *
 * Read, write, and manage Airtable bases
 * - Query records
 * - Create records
 * - Update records
 * - Delete records
 * - Built-in resilience
 *
 * Perfect for:
 * - CRM and lead management
 * - Project tracking
 * - Content calendars
 * - Structured data storage
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

if (!AIRTABLE_API_KEY) {
  logger.warn('⚠️  AIRTABLE_API_KEY not set. Airtable features will not work.');
}

const airtableClient = AIRTABLE_API_KEY
  ? new Airtable({ apiKey: AIRTABLE_API_KEY })
  : null;

// Rate limiter: Airtable allows 5 req/sec per base
const airtableRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 200, // 200ms between requests = 5/sec
  reservoir: 5,
  reservoirRefreshAmount: 5,
  reservoirRefreshInterval: 1000,
  id: 'airtable',
});

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

export interface AirtableQueryOptions {
  baseId: string;
  tableName: string;
  filterByFormula?: string;
  maxRecords?: number;
  sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
  view?: string;
}

/**
 * Internal select records function (unprotected)
 */
async function selectRecordsInternal(
  options: AirtableQueryOptions
): Promise<AirtableRecord[]> {
  if (!airtableClient) {
    throw new Error('Airtable client not initialized. Set AIRTABLE_API_KEY.');
  }

  logger.info(
    {
      baseId: options.baseId,
      tableName: options.tableName,
      hasFilter: !!options.filterByFormula,
    },
    'Selecting Airtable records'
  );

  const base = airtableClient.base(options.baseId);
  const table = base(options.tableName);

  const queryOptions: {
    filterByFormula?: string;
    maxRecords?: number;
    sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
    view?: string;
  } = {};

  if (options.filterByFormula) queryOptions.filterByFormula = options.filterByFormula;
  if (options.maxRecords) queryOptions.maxRecords = options.maxRecords;
  if (options.sort) queryOptions.sort = options.sort;
  if (options.view) queryOptions.view = options.view;

  const records: Records<FieldSet> = await table.select(queryOptions).all();

  logger.info({ recordCount: records.length }, 'Airtable records selected');

  return records.map((record) => ({
    id: record.id,
    fields: record.fields as Record<string, unknown>,
    createdTime: record._rawJson.createdTime,
  }));
}

/**
 * Select records (protected)
 */
const selectRecordsWithBreaker = createCircuitBreaker(selectRecordsInternal, {
  timeout: 15000,
  name: 'airtable-select-records',
});

const selectRecordsRateLimited = withRateLimit(
  async (options: AirtableQueryOptions) => selectRecordsWithBreaker.fire(options),
  airtableRateLimiter
);

export async function selectRecords(
  options: AirtableQueryOptions
): Promise<AirtableRecord[]> {
  return (await selectRecordsRateLimited(options)) as unknown as AirtableRecord[];
}

/**
 * Create record
 */
export async function createRecord(
  baseId: string,
  tableName: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  if (!airtableClient) {
    throw new Error('Airtable client not initialized. Set AIRTABLE_API_KEY.');
  }

  logger.info({ baseId, tableName, fields }, 'Creating Airtable record');

  const base = airtableClient.base(baseId);
  const table = base(tableName);

  const record = await table.create(fields as FieldSet);

  logger.info({ recordId: record.id }, 'Airtable record created');

  return {
    id: record.id,
    fields: record.fields as Record<string, unknown>,
    createdTime: record._rawJson.createdTime,
  };
}

/**
 * Create multiple records (batch)
 */
export async function createRecords(
  baseId: string,
  tableName: string,
  records: Array<Record<string, unknown>>
): Promise<AirtableRecord[]> {
  if (!airtableClient) {
    throw new Error('Airtable client not initialized. Set AIRTABLE_API_KEY.');
  }

  logger.info({ baseId, tableName, recordCount: records.length }, 'Creating Airtable records');

  const base = airtableClient.base(baseId);
  const table = base(tableName);

  const createdRecords = await table.create(
    records.map((fields) => ({ fields: fields as FieldSet }))
  );

  logger.info({ recordCount: createdRecords.length }, 'Airtable records created');

  return createdRecords.map((record) => ({
    id: record.id,
    fields: record.fields as Record<string, unknown>,
    createdTime: record._rawJson.createdTime,
  }));
}

/**
 * Update record
 */
export async function updateRecord(
  baseId: string,
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  if (!airtableClient) {
    throw new Error('Airtable client not initialized. Set AIRTABLE_API_KEY.');
  }

  logger.info({ baseId, tableName, recordId, fields }, 'Updating Airtable record');

  const base = airtableClient.base(baseId);
  const table = base(tableName);

  const record = await table.update(recordId, fields as FieldSet);

  logger.info({ recordId: record.id }, 'Airtable record updated');

  return {
    id: record.id,
    fields: record.fields as Record<string, unknown>,
    createdTime: record._rawJson.createdTime,
  };
}

/**
 * Update multiple records (batch)
 */
export async function updateRecords(
  baseId: string,
  tableName: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>
): Promise<AirtableRecord[]> {
  if (!airtableClient) {
    throw new Error('Airtable client not initialized. Set AIRTABLE_API_KEY.');
  }

  logger.info({ baseId, tableName, recordCount: records.length }, 'Updating Airtable records');

  const base = airtableClient.base(baseId);
  const table = base(tableName);

  const updatedRecords = await table.update(
    records.map((r) => ({ id: r.id, fields: r.fields as FieldSet }))
  );

  logger.info({ recordCount: updatedRecords.length }, 'Airtable records updated');

  return updatedRecords.map((record) => ({
    id: record.id,
    fields: record.fields as Record<string, unknown>,
    createdTime: record._rawJson.createdTime,
  }));
}

/**
 * Delete record
 */
export async function deleteRecord(
  baseId: string,
  tableName: string,
  recordId: string
): Promise<void> {
  if (!airtableClient) {
    throw new Error('Airtable client not initialized. Set AIRTABLE_API_KEY.');
  }

  logger.info({ baseId, tableName, recordId }, 'Deleting Airtable record');

  const base = airtableClient.base(baseId);
  const table = base(tableName);

  await table.destroy(recordId);

  logger.info({ recordId }, 'Airtable record deleted');
}

/**
 * Delete multiple records (batch)
 */
export async function deleteRecords(
  baseId: string,
  tableName: string,
  recordIds: string[]
): Promise<void> {
  if (!airtableClient) {
    throw new Error('Airtable client not initialized. Set AIRTABLE_API_KEY.');
  }

  logger.info({ baseId, tableName, recordCount: recordIds.length }, 'Deleting Airtable records');

  const base = airtableClient.base(baseId);
  const table = base(tableName);

  await table.destroy(recordIds);

  logger.info({ recordCount: recordIds.length }, 'Airtable records deleted');
}

/**
 * Find record by field (convenience)
 */
export async function findRecord(
  baseId: string,
  tableName: string,
  fieldName: string,
  value: string | number
): Promise<AirtableRecord | undefined> {
  const formula =
    typeof value === 'string'
      ? `{${fieldName}} = "${value}"`
      : `{${fieldName}} = ${value}`;

  const records = await selectRecords({
    baseId,
    tableName,
    filterByFormula: formula,
    maxRecords: 1,
  });

  return records[0];
}

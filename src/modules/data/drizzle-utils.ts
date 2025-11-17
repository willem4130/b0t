import { logger } from '@/lib/logger';
import { pool } from '@/lib/db';

/**
 * Drizzle Utils Module
 *
 * Generic database utilities for workflows using the internal PostgreSQL database.
 * Uses the pg pool directly for raw SQL queries with parameterization.
 *
 * Perfect for:
 * - Deduplication tracking (tweet replies, video comments, etc.)
 * - Generic CRUD operations
 * - Workflow state persistence with automatic table creation
 * - Cross-run data storage (survives workflow executions)
 * - Any workflow that needs database interaction
 *
 * WORKFLOW-SCOPED STORAGE:
 * Pass workflowId to automatically namespace tables as: workflow_storage_{workflowId}_{tableName}
 * This prevents conflicts between workflows and enables automatic cleanup.
 *
 * IMPORTANT: This module uses the internal app database (DATABASE_URL).
 * For external databases, use data.postgresql or data.mysql instead.
 */

/**
 * Generate workflow-scoped table name
 * @private
 */
function getWorkflowTableName(workflowId: string | undefined, tableName: string): string {
  if (workflowId) {
    // Sanitize workflowId and tableName to prevent SQL injection
    const sanitizedWorkflowId = workflowId.replace(/[^a-zA-Z0-9_]/g, '_');
    const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    return `workflow_storage_${sanitizedWorkflowId}_${sanitizedTableName}`;
  }
  return tableName;
}

/**
 * Query IDs from a table where a column value is in an array
 *
 * Generic function for duplicate checking across any workflow.
 *
 * @param tableName - Table name as string (must match schema)
 * @param workflowId - Optional workflow ID for automatic table namespacing
 * @param column - Column name to filter by
 * @param values - Array of values to check
 * @param selectColumn - Column to return (defaults to same as filter column)
 * @returns Array of matching values
 *
 * @example
 * // Check which tweet IDs have already been replied to (workflow-scoped)
 * const repliedIds = await queryWhereIn({
 *   workflowId: '{{workflowId}}',
 *   tableName: 'replied_tweets',
 *   column: 'tweet_id',
 *   values: ['123', '456', '789']
 * });
 * // Returns: ['123', '456'] (if those were found)
 * // Table used: workflow_storage_{workflowId}_replied_tweets
 *
 * @example
 * // Legacy usage without workflow scoping (backward compatible)
 * const repliedIds = await queryWhereIn({
 *   tableName: 'tweet_replies',
 *   column: 'original_tweet_id',
 *   values: ['123', '456', '789']
 * });
 */
export async function queryWhereIn(params: {
  tableName: string;
  workflowId?: string;
  column: string;
  values: unknown[];
  selectColumn?: string;
}): Promise<unknown[]> {
  const { tableName, workflowId, column, values, selectColumn } = params;
  const actualTableName = getWorkflowTableName(workflowId, tableName);

  if (!values || values.length === 0) {
    logger.info({ tableName, column }, 'No values to query');
    return [];
  }

  logger.info(
    { tableName: actualTableName, column, valueCount: values.length, workflowScoped: !!workflowId },
    'Querying IDs from database'
  );

  try {
    const selectCol = selectColumn || column;

    // Check if table exists first
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      );
    `;

    const tableExistsResult = await pool.query(tableExistsQuery, [actualTableName]);
    const tableExists = tableExistsResult.rows[0].exists;

    if (!tableExists) {
      logger.info({ tableName, column }, 'Table does not exist yet, returning empty array');
      return [];
    }

    // Build parameterized query
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const queryText = `
      SELECT "${selectCol}"
      FROM "${actualTableName}"
      WHERE "${column}" IN (${placeholders})
    `;

    const result = await pool.query(queryText, values);

    const foundValues = result.rows.map((row: Record<string, unknown>) => row[selectCol]);

    logger.info(
      {
        tableName,
        column,
        totalValues: values.length,
        foundValues: foundValues.length,
      },
      'Query complete'
    );

    return foundValues;
  } catch (error) {
    logger.error({ error, tableName, column }, 'Failed to query where in');
    throw new Error(
      `Failed to query ${tableName}.${column}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * In-memory lock to prevent race conditions during table creation
 */
const tableLocks = new Map<string, Promise<void>>();

/**
 * Ensure a table exists with the specified columns
 *
 * Dynamically creates a table if it doesn't exist based on the data structure.
 * Infers column types from the first record's values.
 *
 * @param tableName - Table name as string
 * @param data - Sample record to infer schema from
 */
async function ensureTable(tableName: string, data: Record<string, unknown>): Promise<void> {
  // Check if there's already an operation in progress for this table
  if (tableLocks.has(tableName)) {
    logger.info({ tableName }, 'Waiting for concurrent table creation to complete');
    await tableLocks.get(tableName);
    return;
  }

  // Create a lock for this table
  const lockPromise = (async () => {
    try {
      // Check if table exists
      const tableExistsQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `;

      const tableExistsResult = await pool.query(tableExistsQuery, [tableName]);
      const tableExists = tableExistsResult.rows[0].exists;

      if (tableExists) {
      // Check if all columns exist, add missing ones
      const columns = Object.keys(data);

      for (const column of columns) {
        const columnExistsQuery = `
          SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
          );
        `;

        const columnExistsResult = await pool.query(columnExistsQuery, [tableName, column]);
        const columnExists = columnExistsResult.rows[0].exists;

        if (!columnExists) {
          const columnType = inferColumnType(data[column]);
          const addColumnQuery = `
            ALTER TABLE "${tableName}"
            ADD COLUMN "${column}" ${columnType};
          `;

          await pool.query(addColumnQuery);
          logger.info({ tableName, column, type: columnType }, 'Added missing column to table');
        }
      }
    } else {
      // Create table with inferred schema
      const columns = Object.keys(data);
      const columnDefinitions = columns.map(col => {
        const type = inferColumnType(data[col]);
        return `"${col}" ${type}`;
      }).join(', ');

      // Use CREATE TABLE IF NOT EXISTS to handle race conditions
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          id SERIAL PRIMARY KEY,
          ${columnDefinitions},
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;

      await pool.query(createTableQuery);
      logger.info({ tableName, columns }, 'Created table dynamically (IF NOT EXISTS)');
    }
    } catch (error) {
      logger.error({ error, tableName }, 'Failed to ensure table exists');
      throw new Error(
        `Failed to ensure table ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      // Remove lock when done
      tableLocks.delete(tableName);
    }
  })();

  // Store the lock promise
  tableLocks.set(tableName, lockPromise);

  // Wait for completion
  await lockPromise;
}

/**
 * Infer PostgreSQL column type from JavaScript value
 */
function inferColumnType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'TEXT';
  }

  const type = typeof value;

  if (type === 'string') {
    const str = value as string;
    // Check if it's an ISO date string (e.g., "2025-11-10T06:11:56.570Z")
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (isoDatePattern.test(str)) {
      return 'TIMESTAMP';
    }
    // For dynamic workflows, always use TEXT to avoid length constraints
    // VARCHAR(255) could fail if subsequent inserts have longer values
    return 'TEXT';
  }

  if (type === 'number') {
    // Check if integer or decimal
    return Number.isInteger(value) ? 'INTEGER' : 'NUMERIC';
  }

  if (type === 'boolean') {
    return 'BOOLEAN';
  }

  if (value instanceof Date) {
    return 'TIMESTAMP';
  }

  // For objects and arrays, store as JSONB
  if (type === 'object') {
    return 'JSONB';
  }

  return 'TEXT';
}

/**
 * Insert a single record into a table
 *
 * Automatically creates the table if it doesn't exist based on the data structure.
 *
 * @param tableName - Table name as string
 * @param workflowId - Optional workflow ID for automatic table namespacing
 * @param data - Record to insert
 * @param expiresInDays - Optional TTL in days (auto-delete after this period)
 * @returns Inserted record
 *
 * @example
 * // Workflow-scoped storage with auto-expiration
 * await insertRecord({
 *   workflowId: '{{workflowId}}',
 *   tableName: 'replied_tweets',
 *   data: {
 *     tweet_id: '123456',
 *     replied_at: new Date(),
 *     reply_text: 'Great point!'
 *   },
 *   expiresInDays: 7
 * });
 * // Table: workflow_storage_{workflowId}_replied_tweets
 * // Auto-deleted after 7 days
 */
export async function insertRecord(params: {
  tableName: string;
  workflowId?: string;
  data: Record<string, unknown>;
  expiresInDays?: number;
}): Promise<Record<string, unknown>> {
  const { tableName, workflowId, data, expiresInDays } = params;
  const actualTableName = getWorkflowTableName(workflowId, tableName);

  logger.info({ tableName: actualTableName, fields: Object.keys(data), workflowScoped: !!workflowId }, 'Inserting record');

  try {
    // Normalize data values FIRST (convert Date objects to ISO strings, etc.)
    // This must happen before ensureTable so type inference works correctly
    const normalizedData = Object.entries(data).reduce((acc, [key, value]) => {
      if (value instanceof Date) {
        acc[key] = value.toISOString();
      } else if (typeof value === 'object' && value !== null && 'toISOString' in value) {
        // Handle serialized Date objects that have toISOString method
        acc[key] = (value as Date).toISOString();
      } else if (typeof value === 'string') {
        // Check if string looks like an ISO date
        const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
        if (isoDatePattern.test(value)) {
          // Keep as is - it's already an ISO string
          acc[key] = value;
        } else {
          acc[key] = value;
        }
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);

    // Add expiration timestamp if TTL is specified
    if (expiresInDays) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      normalizedData.expires_at = expiresAt.toISOString();
    }

    // Ensure table exists with required columns (using normalized data for type inference)
    await ensureTable(actualTableName, normalizedData);

    const columns = Object.keys(normalizedData);
    const values = Object.values(normalizedData);

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const queryText = `
      INSERT INTO "${actualTableName}" (${columns.map(c => `"${c}"`).join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await pool.query(queryText, values);

    logger.info({ tableName: actualTableName }, 'Record inserted successfully');

    return result.rows[0] as Record<string, unknown>;
  } catch (error) {
    logger.error({ error, tableName }, 'Failed to insert record');
    throw new Error(
      `Failed to insert into ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Insert multiple records into a table (bulk insert)
 *
 * @param tableName - Table name as string
 * @param data - Array of records to insert
 * @returns Number of inserted records
 */
export async function insertRecords(params: {
  tableName: string;
  data: Record<string, unknown>[];
}): Promise<number> {
  const { tableName, data } = params;

  if (!data || data.length === 0) {
    logger.info({ tableName }, 'No records to insert');
    return 0;
  }

  logger.info({ tableName, count: data.length }, 'Inserting records (bulk)');

  try {
    const columns = Object.keys(data[0]);
    const allValues: unknown[] = [];

    const valuePlaceholders = data.map((record, recordIndex) => {
      const recordValues = columns.map(col => record[col]);
      allValues.push(...recordValues);

      const startIndex = recordIndex * columns.length + 1;
      const recordPlaceholders = columns.map((_, i) => `$${startIndex + i}`).join(', ');
      return `(${recordPlaceholders})`;
    }).join(', ');

    const queryText = `
      INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
      VALUES ${valuePlaceholders}
    `;

    const result = await pool.query(queryText, allValues);

    const insertedCount = result.rowCount || 0;

    logger.info({ tableName, insertedCount }, 'Bulk insert complete');

    return insertedCount;
  } catch (error) {
    logger.error({ error, tableName, count: data.length }, 'Failed to bulk insert records');
    throw new Error(
      `Failed to bulk insert into ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update a record by ID
 *
 * @param tableName - Table name as string
 * @param workflowId - Optional workflow ID for automatic table namespacing
 * @param id - ID of record to update
 * @param data - Fields to update
 * @param idColumn - Name of ID column (defaults to 'id')
 * @returns Updated record
 */
export async function updateRecord(params: {
  tableName: string;
  workflowId?: string;
  id: string | number;
  data: Record<string, unknown>;
  idColumn?: string;
}): Promise<Record<string, unknown>> {
  const { tableName, workflowId, id, data, idColumn = 'id' } = params;
  const actualTableName = getWorkflowTableName(workflowId, tableName);

  logger.info({ tableName: actualTableName, id, fields: Object.keys(data) }, 'Updating record');

  try {
    const updateFields = Object.keys(data);
    const values = Object.values(data);

    const setClause = updateFields.map((field, i) => `"${field}" = $${i + 1}`).join(', ');
    values.push(id);

    const queryText = `
      UPDATE "${actualTableName}"
      SET ${setClause}
      WHERE "${idColumn}" = $${values.length}
      RETURNING *
    `;

    const result = await pool.query(queryText, values);

    logger.info({ tableName: actualTableName, id }, 'Record updated successfully');

    return result.rows[0] as Record<string, unknown>;
  } catch (error) {
    logger.error({ error, tableName, id }, 'Failed to update record');
    throw new Error(
      `Failed to update ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete a record by ID
 *
 * @param tableName - Table name as string
 * @param workflowId - Optional workflow ID for automatic table namespacing
 * @param id - ID of record to delete
 * @param idColumn - Name of ID column (defaults to 'id')
 * @returns true if deleted, false if not found
 */
export async function deleteRecord(params: {
  tableName: string;
  workflowId?: string;
  id: string | number;
  idColumn?: string;
}): Promise<boolean> {
  const { tableName, workflowId, id, idColumn = 'id' } = params;
  const actualTableName = getWorkflowTableName(workflowId, tableName);

  logger.info({ tableName: actualTableName, id }, 'Deleting record');

  try {
    const queryText = `
      DELETE FROM "${actualTableName}"
      WHERE "${idColumn}" = $1
    `;

    const result = await pool.query(queryText, [id]);

    const deleted = (result.rowCount || 0) > 0;

    logger.info({ tableName: actualTableName, id, deleted }, 'Delete operation complete');

    return deleted;
  } catch (error) {
    logger.error({ error, tableName, id }, 'Failed to delete record');
    throw new Error(
      `Failed to delete from ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Query records with a simple WHERE clause
 *
 * @param tableName - Table name
 * @param workflowId - Optional workflow ID for automatic table namespacing
 * @param where - WHERE conditions as key-value pairs
 * @param limit - Max records to return
 * @returns Array of matching records
 */
export async function queryRecords(params: {
  tableName: string;
  workflowId?: string;
  where?: Record<string, unknown>;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const { tableName, workflowId, where, limit } = params;
  const actualTableName = getWorkflowTableName(workflowId, tableName);

  logger.info({ tableName: actualTableName, where, limit }, 'Querying records');

  try {
    let queryText = `SELECT * FROM "${actualTableName}"`;
    const values: unknown[] = [];

    if (where && Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map((key, i) => {
        values.push(where[key]);
        return `"${key}" = $${i + 1}`;
      }).join(' AND ');

      queryText += ` WHERE ${conditions}`;
    }

    if (limit) {
      queryText += ` LIMIT ${limit}`;
    }

    const result = await pool.query(queryText, values);

    logger.info(
      { tableName, recordCount: result.rows.length },
      'Query complete'
    );

    return result.rows as Record<string, unknown>[];
  } catch (error) {
    logger.error({ error, tableName }, 'Failed to query records');
    throw new Error(
      `Failed to query ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

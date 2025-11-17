import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';

/**
 * PostgreSQL Module
 *
 * Connect and interact with PostgreSQL databases
 * - SQL query execution
 * - Prepared statements
 * - Transactions
 * - Connection pooling
 * - JSON operations
 *
 * Perfect for:
 * - Relational data storage
 * - Complex queries with CTEs
 * - JSON/JSONB operations
 * - Full-text search
 */

const pools = new Map<string, Pool>();

/**
 * Validate identifier (table/column names) to prevent SQL injection
 * Only allows alphanumeric characters, underscores, and dots
 */
function validateIdentifier(identifier: string): string {
  if (!/^[a-zA-Z0-9_.]+$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}. Only alphanumeric characters, underscores, and dots are allowed.`);
  }
  return identifier;
}

/**
 * Quote identifier for safe use in SQL
 */
function quoteIdentifier(identifier: string): string {
  validateIdentifier(identifier);
  return `"${identifier.replace(/"/g, '""')}"`;
}

export interface PostgreSQLConnectionOptions {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  max?: number;
}

export interface PostgreSQLQueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  fields: Array<{ name: string; dataTypeID: number }>;
}

/**
 * Get or create connection pool
 */
function getPool(options: PostgreSQLConnectionOptions): Pool {
  const key = `${options.host}:${options.port || 5432}/${options.database}`;

  if (pools.has(key)) {
    return pools.get(key)!;
  }

  logger.info({ host: options.host, database: options.database }, 'Creating PostgreSQL pool');

  const poolConfig: PoolConfig = {
    host: options.host,
    port: options.port || 5432,
    user: options.user,
    password: options.password,
    database: options.database,
    max: options.max || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  if (options.ssl) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);

  pools.set(key, pool);

  logger.info({ host: options.host, database: options.database }, 'PostgreSQL pool created');

  return pool;
}

/**
 * Execute SQL query
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  connection: PostgreSQLConnectionOptions,
  sql: string,
  params?: unknown[]
): Promise<PostgreSQLQueryResult<T>> {
  logger.info({ database: connection.database, sql }, 'Executing PostgreSQL query');

  try {
    const pool = getPool(connection);

    const result: QueryResult<T> = await pool.query(sql, params);

    const queryResult: PostgreSQLQueryResult<T> = {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      fields: result.fields.map((field) => ({
        name: field.name,
        dataTypeID: field.dataTypeID,
      })),
    };

    logger.info(
      {
        database: connection.database,
        rowCount: queryResult.rowCount,
      },
      'PostgreSQL query executed'
    );

    return queryResult;
  } catch (error) {
    logger.error(
      { error, database: connection.database, sql },
      'Failed to execute PostgreSQL query'
    );
    throw new Error(
      `Failed to execute PostgreSQL query: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Select rows
 */
export async function select<T extends QueryResultRow = Record<string, unknown>>(
  connection: PostgreSQLConnectionOptions,
  table: string,
  options: {
    columns?: string[];
    where?: Record<string, unknown>;
    orderBy?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<T[]> {
  logger.info({ database: connection.database, table, options }, 'Selecting from PostgreSQL');

  try {
    // Validate and quote table name
    const quotedTable = quoteIdentifier(table);

    // Validate and quote column names
    const columns = options.columns
      ? options.columns.map((col) => quoteIdentifier(col)).join(', ')
      : '*';

    let sql = `SELECT ${columns} FROM ${quotedTable}`;
    const params: unknown[] = [];
    let paramIndex = 1;

    // WHERE clause - validate column names
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.keys(options.where).map((key) => {
        const quotedKey = quoteIdentifier(key);
        return `${quotedKey} = $${paramIndex++}`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
      params.push(...Object.values(options.where));
    }

    // ORDER BY - validate column names and direction
    if (options.orderBy) {
      // Parse ORDER BY (e.g., "column ASC" or "column1, column2 DESC")
      const orderParts = options.orderBy.split(',').map((part) => {
        const tokens = part.trim().split(/\s+/);
        const column = quoteIdentifier(tokens[0]);
        const direction = tokens[1]?.toUpperCase();
        if (direction && !['ASC', 'DESC'].includes(direction)) {
          throw new Error(`Invalid ORDER BY direction: ${direction}`);
        }
        return direction ? `${column} ${direction}` : column;
      });
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // LIMIT and OFFSET
    if (options.limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await query<T>(connection, sql, params);

    return result.rows;
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to select from PostgreSQL'
    );
    throw new Error(
      `Failed to select from PostgreSQL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Insert row
 */
export async function insert<T extends QueryResultRow = Record<string, unknown>>(
  connection: PostgreSQLConnectionOptions,
  table: string,
  data: Record<string, unknown>
): Promise<T> {
  logger.info({ database: connection.database, table }, 'Inserting into PostgreSQL');

  try {
    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    const columns = Object.keys(data).map((col) => quoteIdentifier(col)).join(', ');
    const placeholders = Object.keys(data)
      .map((_, i) => `$${i + 1}`)
      .join(', ');
    const values = Object.values(data);

    const sql = `INSERT INTO ${quotedTable} (${columns}) VALUES (${placeholders}) RETURNING *`;

    const result = await query<T>(connection, sql, values);

    logger.info(
      {
        database: connection.database,
        table,
      },
      'Inserted into PostgreSQL'
    );

    return result.rows[0];
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to insert into PostgreSQL'
    );
    throw new Error(
      `Failed to insert into PostgreSQL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Insert multiple rows
 */
export async function insertMany<T extends QueryResultRow = Record<string, unknown>>(
  connection: PostgreSQLConnectionOptions,
  table: string,
  rows: Array<Record<string, unknown>>
): Promise<T[]> {
  logger.info(
    {
      database: connection.database,
      table,
      count: rows.length,
    },
    'Inserting multiple rows into PostgreSQL'
  );

  try {
    if (rows.length === 0) {
      return [];
    }

    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    const columns = Object.keys(rows[0]).map((col) => quoteIdentifier(col)).join(', ');
    let paramIndex = 1;

    const valueSets = rows.map((row) => {
      const placeholders = Object.keys(row)
        .map(() => `$${paramIndex++}`)
        .join(', ');
      return `(${placeholders})`;
    });

    const values = rows.flatMap((row) => Object.values(row));

    const sql = `INSERT INTO ${quotedTable} (${columns}) VALUES ${valueSets.join(', ')} RETURNING *`;

    const result = await query<T>(connection, sql, values);

    logger.info(
      {
        database: connection.database,
        table,
        rowCount: result.rowCount,
      },
      'Inserted multiple rows into PostgreSQL'
    );

    return result.rows;
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to insert multiple rows into PostgreSQL'
    );
    throw new Error(
      `Failed to insert multiple rows into PostgreSQL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update rows
 */
export async function update<T extends QueryResultRow = Record<string, unknown>>(
  connection: PostgreSQLConnectionOptions,
  table: string,
  data: Record<string, unknown>,
  where: Record<string, unknown>
): Promise<T[]> {
  logger.info({ database: connection.database, table, where }, 'Updating PostgreSQL rows');

  try {
    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    let paramIndex = 1;

    const setClause = Object.keys(data)
      .map((key) => `${quoteIdentifier(key)} = $${paramIndex++}`)
      .join(', ');
    const whereClause = Object.keys(where)
      .map((key) => `${quoteIdentifier(key)} = $${paramIndex++}`)
      .join(' AND ');

    const params = [...Object.values(data), ...Object.values(where)];

    const sql = `UPDATE ${quotedTable} SET ${setClause} WHERE ${whereClause} RETURNING *`;

    const result = await query<T>(connection, sql, params);

    logger.info(
      {
        database: connection.database,
        table,
        rowCount: result.rowCount,
      },
      'Updated PostgreSQL rows'
    );

    return result.rows;
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to update PostgreSQL rows'
    );
    throw new Error(
      `Failed to update PostgreSQL rows: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete rows
 */
export async function deleteRows<T extends QueryResultRow = Record<string, unknown>>(
  connection: PostgreSQLConnectionOptions,
  table: string,
  where: Record<string, unknown>
): Promise<T[]> {
  logger.info({ database: connection.database, table, where }, 'Deleting PostgreSQL rows');

  try {
    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    let paramIndex = 1;

    const whereClause = Object.keys(where)
      .map((key) => `${quoteIdentifier(key)} = $${paramIndex++}`)
      .join(' AND ');
    const params = Object.values(where);

    const sql = `DELETE FROM ${quotedTable} WHERE ${whereClause} RETURNING *`;

    const result = await query<T>(connection, sql, params);

    logger.info(
      {
        database: connection.database,
        table,
        rowCount: result.rowCount,
      },
      'Deleted PostgreSQL rows'
    );

    return result.rows;
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to delete PostgreSQL rows'
    );
    throw new Error(
      `Failed to delete PostgreSQL rows: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Execute transaction
 */
export async function transaction(
  connection: PostgreSQLConnectionOptions,
  queries: Array<{ sql: string; params?: unknown[] }>
): Promise<unknown[]> {
  logger.info(
    {
      database: connection.database,
      queryCount: queries.length,
    },
    'Starting PostgreSQL transaction'
  );

  const pool = getPool(connection);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results: unknown[] = [];

    for (const { sql, params } of queries) {
      const result = await client.query(sql, params);
      results.push(result.rows);
    }

    await client.query('COMMIT');

    logger.info(
      {
        database: connection.database,
        queryCount: queries.length,
      },
      'PostgreSQL transaction committed'
    );

    return results;
  } catch (error) {
    await client.query('ROLLBACK');

    logger.error({ error, database: connection.database }, 'PostgreSQL transaction rolled back');

    throw new Error(
      `PostgreSQL transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    client.release();
  }
}

/**
 * Count rows
 */
export async function count(
  connection: PostgreSQLConnectionOptions,
  table: string,
  where?: Record<string, unknown>
): Promise<number> {
  logger.info({ database: connection.database, table, where }, 'Counting PostgreSQL rows');

  try {
    // Validate and quote table name
    const quotedTable = quoteIdentifier(table);
    let sql = `SELECT COUNT(*) as count FROM ${quotedTable}`;
    const params: unknown[] = [];

    if (where && Object.keys(where).length > 0) {
      let paramIndex = 1;
      const conditions = Object.keys(where).map((key) => {
        const quotedKey = quoteIdentifier(key);
        return `${quotedKey} = $${paramIndex++}`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
      params.push(...Object.values(where));
    }

    const result = await query<{ count: string }>(connection, sql, params);

    const count = parseInt(result.rows[0].count, 10);

    logger.info({ database: connection.database, table, count }, 'PostgreSQL rows counted');

    return count;
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to count PostgreSQL rows'
    );
    throw new Error(
      `Failed to count PostgreSQL rows: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if table exists
 */
export async function tableExists(
  connection: PostgreSQLConnectionOptions,
  table: string
): Promise<boolean> {
  logger.info({ database: connection.database, table }, 'Checking if PostgreSQL table exists');

  try {
    const sql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = $1
      ) as exists
    `;

    const result = await query<{ exists: boolean }>(connection, sql, [table]);

    const exists = result.rows[0].exists;

    logger.info(
      { database: connection.database, table, exists },
      'PostgreSQL table existence checked'
    );

    return exists;
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to check if PostgreSQL table exists'
    );
    throw new Error(
      `Failed to check if PostgreSQL table exists: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Execute raw JSON query (for JSONB columns)
 */
export async function queryJson<T extends QueryResultRow = Record<string, unknown>>(
  connection: PostgreSQLConnectionOptions,
  table: string,
  jsonColumn: string,
  jsonPath: string,
  value?: unknown
): Promise<T[]> {
  logger.info(
    {
      database: connection.database,
      table,
      jsonColumn,
      jsonPath,
    },
    'Querying JSON in PostgreSQL'
  );

  try {
    // Validate and quote identifiers
    const quotedTable = quoteIdentifier(table);
    const quotedColumn = quoteIdentifier(jsonColumn);

    // Validate jsonPath to prevent injection - only allow safe characters
    if (!/^[a-zA-Z0-9_.]+$/.test(jsonPath)) {
      throw new Error(`Invalid JSON path: ${jsonPath}. Only alphanumeric characters, underscores, and dots are allowed.`);
    }

    let sql: string;
    const params: unknown[] = [];

    if (value !== undefined) {
      // Use parameterized query for the value
      sql = `SELECT * FROM ${quotedTable} WHERE ${quotedColumn}->>'${jsonPath}' = $1`;
      params.push(value);
    } else {
      sql = `SELECT ${quotedColumn}->>'${jsonPath}' as value FROM ${quotedTable}`;
    }

    const result = await query<T>(connection, sql, params);

    logger.info(
      {
        database: connection.database,
        table,
        rowCount: result.rowCount,
      },
      'JSON query completed'
    );

    return result.rows;
  } catch (error) {
    logger.error({ error, database: connection.database, table }, 'Failed to query JSON');
    throw new Error(
      `Failed to query JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Close all pools
 */
export async function closeAll(): Promise<void> {
  logger.info({ poolCount: pools.size }, 'Closing all PostgreSQL pools');

  const closePromises = Array.from(pools.values()).map((pool) => pool.end());

  await Promise.all(closePromises);

  pools.clear();

  logger.info('All PostgreSQL pools closed');
}

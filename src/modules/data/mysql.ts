import mysql from 'mysql2/promise';
import { logger } from '@/lib/logger';

/**
 * MySQL Module
 *
 * Connect and interact with MySQL databases
 * - SQL query execution
 * - Prepared statements
 * - Transactions
 * - Connection pooling
 * - Batch operations
 *
 * Perfect for:
 * - Relational data storage
 * - OLTP workflows
 * - Data migrations
 * - Reporting queries
 */

const pools = new Map<string, mysql.Pool>();

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
 * Quote identifier for safe use in SQL (MySQL uses backticks)
 */
function quoteIdentifier(identifier: string): string {
  validateIdentifier(identifier);
  return `\`${identifier.replace(/`/g, '``')}\``;
}

export interface MySQLConnectionOptions {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
}

export interface MySQLQueryResult {
  rows: unknown[];
  fields: mysql.FieldPacket[];
  affectedRows?: number;
  insertId?: number;
}

/**
 * Get or create connection pool
 */
function getPool(options: MySQLConnectionOptions): mysql.Pool {
  const key = `${options.host}:${options.port || 3306}/${options.database}`;

  if (pools.has(key)) {
    return pools.get(key)!;
  }

  logger.info({ host: options.host, database: options.database }, 'Creating MySQL pool');

  const pool = mysql.createPool({
    host: options.host,
    port: options.port || 3306,
    user: options.user,
    password: options.password,
    database: options.database,
    connectionLimit: options.connectionLimit || 10,
    waitForConnections: true,
    queueLimit: 0,
  });

  pools.set(key, pool);

  logger.info({ host: options.host, database: options.database }, 'MySQL pool created');

  return pool;
}

/**
 * Execute SQL query
 */
export async function query(
  connection: MySQLConnectionOptions,
  sql: string,
  params?: unknown[]
): Promise<MySQLQueryResult> {
  logger.info({ database: connection.database, sql }, 'Executing MySQL query');

  try {
    const pool = getPool(connection);

    const [rows, fields] = await pool.execute(sql, params);

    const result: MySQLQueryResult = {
      rows: Array.isArray(rows) ? rows : [rows],
      fields: fields as mysql.FieldPacket[],
    };

    if (!Array.isArray(rows) && 'affectedRows' in rows) {
      result.affectedRows = (rows as mysql.ResultSetHeader).affectedRows;
    }

    if (!Array.isArray(rows) && 'insertId' in rows) {
      result.insertId = (rows as mysql.ResultSetHeader).insertId;
    }

    logger.info(
      {
        database: connection.database,
        rowCount: result.rows.length,
        affectedRows: result.affectedRows,
      },
      'MySQL query executed'
    );

    return result;
  } catch (error) {
    logger.error({ error, database: connection.database, sql }, 'Failed to execute MySQL query');
    throw new Error(
      `Failed to execute MySQL query: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Select rows
 */
export async function select(
  connection: MySQLConnectionOptions,
  table: string,
  options: {
    columns?: string[];
    where?: Record<string, unknown>;
    orderBy?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<unknown[]> {
  logger.info({ database: connection.database, table, options }, 'Selecting from MySQL');

  try {
    // Validate and quote table name
    const quotedTable = quoteIdentifier(table);

    // Validate and quote column names
    const columns = options.columns
      ? options.columns.map((col) => quoteIdentifier(col)).join(', ')
      : '*';

    let sql = `SELECT ${columns} FROM ${quotedTable}`;
    const params: unknown[] = [];

    // WHERE clause - validate column names
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.keys(options.where).map((key) => {
        const quotedKey = quoteIdentifier(key);
        return `${quotedKey} = ?`;
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
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const result = await query(connection, sql, params);

    return result.rows;
  } catch (error) {
    logger.error({ error, database: connection.database, table }, 'Failed to select from MySQL');
    throw new Error(
      `Failed to select from MySQL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Insert row
 */
export async function insert(
  connection: MySQLConnectionOptions,
  table: string,
  data: Record<string, unknown>
): Promise<{ insertId: number; affectedRows: number }> {
  logger.info({ database: connection.database, table }, 'Inserting into MySQL');

  try {
    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    const columns = Object.keys(data).map((col) => quoteIdentifier(col)).join(', ');
    const placeholders = Object.keys(data)
      .map(() => '?')
      .join(', ');
    const values = Object.values(data);

    const sql = `INSERT INTO ${quotedTable} (${columns}) VALUES (${placeholders})`;

    const result = await query(connection, sql, values);

    logger.info(
      {
        database: connection.database,
        table,
        insertId: result.insertId,
      },
      'Inserted into MySQL'
    );

    return {
      insertId: result.insertId || 0,
      affectedRows: result.affectedRows || 0,
    };
  } catch (error) {
    logger.error({ error, database: connection.database, table }, 'Failed to insert into MySQL');
    throw new Error(
      `Failed to insert into MySQL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Insert multiple rows
 */
export async function insertMany(
  connection: MySQLConnectionOptions,
  table: string,
  rows: Array<Record<string, unknown>>
): Promise<{ affectedRows: number }> {
  logger.info(
    {
      database: connection.database,
      table,
      count: rows.length,
    },
    'Inserting multiple rows into MySQL'
  );

  try {
    if (rows.length === 0) {
      return { affectedRows: 0 };
    }

    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    const columns = Object.keys(rows[0]).map((col) => quoteIdentifier(col)).join(', ');
    const placeholders = rows
      .map(
        (row) =>
          `(${Object.keys(row)
            .map(() => '?')
            .join(', ')})`
      )
      .join(', ');

    const values = rows.flatMap((row) => Object.values(row));

    const sql = `INSERT INTO ${quotedTable} (${columns}) VALUES ${placeholders}`;

    const result = await query(connection, sql, values);

    logger.info(
      {
        database: connection.database,
        table,
        affectedRows: result.affectedRows,
      },
      'Inserted multiple rows into MySQL'
    );

    return {
      affectedRows: result.affectedRows || 0,
    };
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to insert multiple rows into MySQL'
    );
    throw new Error(
      `Failed to insert multiple rows into MySQL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update rows
 */
export async function update(
  connection: MySQLConnectionOptions,
  table: string,
  data: Record<string, unknown>,
  where: Record<string, unknown>
): Promise<{ affectedRows: number }> {
  logger.info({ database: connection.database, table, where }, 'Updating MySQL rows');

  try {
    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    const setClause = Object.keys(data)
      .map((key) => `${quoteIdentifier(key)} = ?`)
      .join(', ');
    const whereClause = Object.keys(where)
      .map((key) => `${quoteIdentifier(key)} = ?`)
      .join(' AND ');

    const params = [...Object.values(data), ...Object.values(where)];

    const sql = `UPDATE ${quotedTable} SET ${setClause} WHERE ${whereClause}`;

    const result = await query(connection, sql, params);

    logger.info(
      {
        database: connection.database,
        table,
        affectedRows: result.affectedRows,
      },
      'Updated MySQL rows'
    );

    return {
      affectedRows: result.affectedRows || 0,
    };
  } catch (error) {
    logger.error({ error, database: connection.database, table }, 'Failed to update MySQL rows');
    throw new Error(
      `Failed to update MySQL rows: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete rows
 */
export async function deleteRows(
  connection: MySQLConnectionOptions,
  table: string,
  where: Record<string, unknown>
): Promise<{ affectedRows: number }> {
  logger.info({ database: connection.database, table, where }, 'Deleting MySQL rows');

  try {
    // Validate and quote table and column names
    const quotedTable = quoteIdentifier(table);
    const whereClause = Object.keys(where)
      .map((key) => `${quoteIdentifier(key)} = ?`)
      .join(' AND ');
    const params = Object.values(where);

    const sql = `DELETE FROM ${quotedTable} WHERE ${whereClause}`;

    const result = await query(connection, sql, params);

    logger.info(
      {
        database: connection.database,
        table,
        affectedRows: result.affectedRows,
      },
      'Deleted MySQL rows'
    );

    return {
      affectedRows: result.affectedRows || 0,
    };
  } catch (error) {
    logger.error({ error, database: connection.database, table }, 'Failed to delete MySQL rows');
    throw new Error(
      `Failed to delete MySQL rows: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Execute transaction
 */
export async function transaction(
  connection: MySQLConnectionOptions,
  queries: Array<{ sql: string; params?: unknown[] }>
): Promise<unknown[]> {
  logger.info(
    {
      database: connection.database,
      queryCount: queries.length,
    },
    'Starting MySQL transaction'
  );

  const pool = getPool(connection);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const results: unknown[] = [];

    for (const { sql, params } of queries) {
      const [rows] = await conn.execute(sql, params);
      results.push(rows);
    }

    await conn.commit();

    logger.info(
      {
        database: connection.database,
        queryCount: queries.length,
      },
      'MySQL transaction committed'
    );

    return results;
  } catch (error) {
    await conn.rollback();

    logger.error({ error, database: connection.database }, 'MySQL transaction rolled back');

    throw new Error(
      `MySQL transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    conn.release();
  }
}

/**
 * Count rows
 */
export async function count(
  connection: MySQLConnectionOptions,
  table: string,
  where?: Record<string, unknown>
): Promise<number> {
  logger.info({ database: connection.database, table, where }, 'Counting MySQL rows');

  try {
    // Validate and quote table name
    const quotedTable = quoteIdentifier(table);
    let sql = `SELECT COUNT(*) as count FROM ${quotedTable}`;
    const params: unknown[] = [];

    if (where && Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map((key) => {
        const quotedKey = quoteIdentifier(key);
        return `${quotedKey} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
      params.push(...Object.values(where));
    }

    const result = await query(connection, sql, params);

    const count = (result.rows[0] as { count: number }).count;

    logger.info({ database: connection.database, table, count }, 'MySQL rows counted');

    return count;
  } catch (error) {
    logger.error({ error, database: connection.database, table }, 'Failed to count MySQL rows');
    throw new Error(
      `Failed to count MySQL rows: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if table exists
 */
export async function tableExists(
  connection: MySQLConnectionOptions,
  table: string
): Promise<boolean> {
  logger.info({ database: connection.database, table }, 'Checking if MySQL table exists');

  try {
    const sql = `SHOW TABLES LIKE ?`;
    const result = await query(connection, sql, [table]);

    const exists = result.rows.length > 0;

    logger.info({ database: connection.database, table, exists }, 'MySQL table existence checked');

    return exists;
  } catch (error) {
    logger.error(
      { error, database: connection.database, table },
      'Failed to check if MySQL table exists'
    );
    throw new Error(
      `Failed to check if MySQL table exists: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Close all pools
 */
export async function closeAll(): Promise<void> {
  logger.info({ poolCount: pools.size }, 'Closing all MySQL pools');

  const closePromises = Array.from(pools.values()).map((pool) => pool.end());

  await Promise.all(closePromises);

  pools.clear();

  logger.info('All MySQL pools closed');
}

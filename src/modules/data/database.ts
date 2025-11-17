import { logger } from '@/lib/logger';

/**
 * Database Module
 *
 * Generic database operations for workflows.
 * Provides safe, parameterized queries for common database tasks.
 *
 * NOTE: This module is deprecated. These functions were designed for SQLite
 * and need to be migrated to PostgreSQL/Drizzle ORM.
 *
 * For new workflows, please use Drizzle ORM directly in your workflow code.
 */

export async function query(params: {
  table: string;
  select?: string[];
  where?: Record<string, unknown>;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const { table } = params;
  logger.error({ table }, 'Database module query() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

export async function queryWhereIn(params: {
  table: string;
  column: string;
  values: unknown[];
  select?: string[];
}): Promise<Record<string, unknown>[]> {
  const { table, column } = params;
  logger.error({ table, column }, 'Database module queryWhereIn() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

export async function insert(params: {
  table: string;
  data: Record<string, unknown> | Record<string, unknown>[];
}): Promise<void> {
  const { table } = params;
  logger.error({ table }, 'Database module insert() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

export async function update(params: {
  table: string;
  data: Record<string, unknown>;
  where: Record<string, unknown>;
}): Promise<void> {
  const { table } = params;
  logger.error({ table }, 'Database module update() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

export async function deleteRecords(params: {
  table: string;
  where: Record<string, unknown>;
}): Promise<void> {
  const { table } = params;
  logger.error({ table }, 'Database module deleteRecords() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

export async function count(params: {
  table: string;
  where?: Record<string, unknown>;
}): Promise<number> {
  const { table } = params;
  logger.error({ table }, 'Database module count() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

export async function exists(params: {
  table: string;
  where: Record<string, unknown>;
}): Promise<boolean> {
  const { table } = params;
  logger.error({ table }, 'Database module exists() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

export async function getOne(params: {
  table: string;
  where: Record<string, unknown>;
  select?: string[];
}): Promise<Record<string, unknown> | null> {
  const { table } = params;
  logger.error({ table }, 'Database module getOne() is deprecated and not implemented for PostgreSQL');
  throw new Error(
    'Database module is deprecated. This function was designed for SQLite. ' +
    'Please migrate to PostgreSQL/Drizzle ORM. ' +
    'See src/lib/db.ts and src/lib/schema.ts for examples.'
  );
}

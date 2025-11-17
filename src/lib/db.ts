import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { logger } from './logger';

// PostgreSQL configuration
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required. Make sure Docker PostgreSQL is running.');
}

// Only log in production or if explicitly requested
if (process.env.NODE_ENV === 'production' || process.env.LOG_DB_CONFIG === 'true') {
  logger.info(
    {
      action: 'db_connection_selected',
      database: 'postgresql',
      urlPreview: databaseUrl.substring(0, 30) + '...',
    },
    'Using PostgreSQL database'
  );
}

// Configurable connection pool for scaling
// Updated defaults to match worker concurrency (25) + overhead for web requests
// Development: 30 connections (single instance) - matches 25 worker concurrency + 5 for web
// Production: 100 connections (vertical scaling) or 50 per worker (horizontal scaling)
const maxConnections = parseInt(process.env.DB_POOL_MAX || '30', 10);
const minConnections = parseInt(process.env.DB_POOL_MIN || '5', 10);
const connectionTimeoutMs = parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10);
const idleTimeoutMs = parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10);

const pool = new Pool({
  connectionString: databaseUrl,
  max: maxConnections, // Maximum pool size
  min: minConnections, // Minimum pool size (keep connections warm)
  connectionTimeoutMillis: connectionTimeoutMs, // Timeout when acquiring connection
  idleTimeoutMillis: idleTimeoutMs, // Close idle connections after 30s
  allowExitOnIdle: false, // Keep pool alive
});

// Only log in production or if explicitly requested
if (process.env.NODE_ENV === 'production' || process.env.LOG_DB_CONFIG === 'true') {
  logger.info(
    {
      action: 'db_pool_configured',
      minConnections,
      maxConnections,
      connectionTimeoutMs,
      idleTimeoutMs,
    },
    `Database pool configured: ${minConnections}-${maxConnections} connections`
  );
}

// Pool error handling
pool.on('error', (err) => {
  logger.error(
    {
      action: 'db_pool_error',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
    'Unexpected database pool error'
  );
});

// Pool monitoring (optional, useful for debugging)
if (process.env.DB_POOL_LOGGING === 'true') {
  pool.on('connect', () => {
    logger.debug(
      { action: 'db_pool_connect' },
      'Database pool client connected'
    );
  });
  pool.on('acquire', () => {
    logger.debug(
      { action: 'db_pool_acquire' },
      'Connection acquired from pool'
    );
  });
  pool.on('release', () => {
    logger.debug(
      { action: 'db_pool_release' },
      'Connection released back to pool'
    );
  });
}

export const db = drizzle(pool);

// Export pool for monitoring
export { pool };

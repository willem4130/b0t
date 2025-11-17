import pino from 'pino';

/**
 * Edge Runtime Compatible Logger
 *
 * This is a minimal logger for Edge Runtime (middleware, Edge API routes).
 * Does not use Node.js modules like 'fs' or 'path'.
 * Logs only to console.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

// Create logger with stdout only (Edge Runtime compatible)
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(1) // stdout
);

// Helper functions for common logging patterns
export const logJobStart = (jobName: string) => {
  logger.info({ job: jobName }, `🔄 Starting job: ${jobName}`);
};

export const logJobComplete = (jobName: string, duration?: number) => {
  logger.info({ job: jobName, duration }, `✅ Completed job: ${jobName}`);
};

export const logJobError = (jobName: string, error: unknown) => {
  logger.error(
    { job: jobName, error: error instanceof Error ? error.message : String(error) },
    `❌ Job failed: ${jobName}`
  );
};

export const logApiRequest = (method: string, path: string, statusCode: number) => {
  logger.info({ method, path, statusCode }, `${method} ${path} - ${statusCode}`);
};

export const logApiError = (method: string, path: string, error: unknown) => {
  logger.error(
    { method, path, error: error instanceof Error ? error.message : String(error) },
    `API error: ${method} ${path}`
  );
};

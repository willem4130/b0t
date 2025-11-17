import pino from 'pino';

/**
 * Structured logging with Pino + File Logging
 *
 * Logs are written to:
 * - logs/app.log (all logs)
 * - logs/error.log (errors only)
 * - Console (development)
 *
 * Note: File rotation can be handled externally (e.g., logrotate, Docker, or Railway's built-in log retention)
 *
 * Usage:
 * logger.info('Tweet generated', { tweetId: '123', content: 'Hello world' });
 * logger.error('Failed to post', { error: err.message });
 * logger.debug('Debug info', { data: someData });
 */

// IMPORTANT: Check Edge Runtime BEFORE accessing any Node.js APIs
const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge';

// Create logger based on runtime environment
let pinoLogger: pino.Logger;

if (isEdgeRuntime) {
  // Simple Edge-compatible logger - no Node.js APIs
  pinoLogger = pino({
    level: 'info',
    browser: {
      asObject: true,
    },
  });
} else {
  // Node.js runtime - load full logger from separate file
  // This avoids bundling Node.js APIs into Edge Runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createNodeLogger } = require('./logger.node');
  pinoLogger = createNodeLogger();
}

// Export the logger
export const logger = pinoLogger;

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

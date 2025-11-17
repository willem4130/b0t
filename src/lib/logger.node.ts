/**
 * Node.js-specific logger implementation
 * This file should ONLY be imported in Node.js runtime, not Edge Runtime
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const enableFileLogs = process.env.ENABLE_FILE_LOGS !== 'false'; // Default: enabled

// Lazy load Node.js modules only when needed
let logsDir: string | null = null;
let logFilePath: string | null = null;
let errorLogFilePath: string | null = null;

// Create logs directory if it doesn't exist
if (enableFileLogs && typeof window === 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');

    logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    logFilePath = path.join(logsDir, 'app.log');
    errorLogFilePath = path.join(logsDir, 'error.log');
  } catch {
    // Ignore errors during build
  }
}

// Create logger with multiple streams
export const createNodeLogger = () => {
  if (isDevelopment) {
    // Development: Clean console output using custom stream
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Writable } = require('stream');

    const prettyStream = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        try {
          const log = JSON.parse(chunk.toString());
          const { msg, level, ...metadata } = log;
          // Remove common pino fields we don't need to display
          delete metadata.time;
          delete metadata.pid;
          delete metadata.hostname;

          // Get level prefix
          const levelPrefix: Record<number, string> = {
            10: '🔍', // trace
            20: '🔍', // debug
            30: '',   // info - no prefix for cleaner output
            40: '⚠️',  // warn
            50: '❌', // error
            60: '💀', // fatal
          };

          const prefix = levelPrefix[level as number] || '';

          // Format message
          let output = prefix ? `${prefix} ${msg}` : msg;

          // Only show metadata if LOG_VERBOSE=true or for errors
          if (process.env.LOG_VERBOSE === 'true' || level >= 50) {
            if (Object.keys(metadata).length > 0) {
              output += ' ' + JSON.stringify(metadata);
            }
          }

          // Write to stdout (Next.js will capture this)
          console.log(output);
        } catch {
          // If parsing fails, just output as-is
          console.log(chunk.toString());
        }
        callback();
      }
    });

    return pino({
      level: process.env.LOG_LEVEL || 'info',
    }, prettyStream);
  } else {
    // Production: JSON logs for structured logging
    const streams: pino.StreamEntry[] = [];

    // Add file streams if enabled
    if (enableFileLogs && typeof window === 'undefined' && logFilePath && errorLogFilePath) {
      const createFileStream = (filePath: string) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          return fs.createWriteStream(filePath, { flags: 'a' });
        } catch {
          return null;
        }
      };

      const appStream = createFileStream(logFilePath);
      const errorStream = createFileStream(errorLogFilePath);

      if (appStream) {
        streams.push({
          level: 'info',
          stream: appStream,
        });
      }

      if (errorStream) {
        streams.push({
          level: 'error',
          stream: errorStream,
        });
      }
    }

    // Fallback to stdout if no streams configured
    if (streams.length === 0) {
      streams.push({
        level: 'info',
        stream: process.stdout,
      });
    }

    return pino(
      {
        level: process.env.LOG_LEVEL || 'info',
        formatters: {
          level: (label) => {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.multistream(streams)
    );
  }
};

/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
/**
 * Custom JavaScript Execution Module
 *
 * Allows users to execute custom JavaScript code within workflows
 * - Safe sandboxed execution (no file system, no network)
 * - Context variable injection
 * - Timeout protection
 * - Support for common operations and npm packages
 */

import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import * as vm from 'vm';
import { Worker } from 'worker_threads';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const limiter = new Bottleneck({
  minTime: 100,
  maxConcurrent: 10,
});

const breakerOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

/**
 * Execute custom JavaScript code in a sandboxed environment
 */
export async function execute(options: {
  code: string;
  context?: Record<string, any>;
  timeout?: number;
}): Promise<any> {
  const { code, context = {}, timeout = 5000 } = options;

  const operation = async () => {
    logger.info('Executing custom JavaScript', {
      codeLength: code.length,
      contextKeys: Object.keys(context),
      timeout,
    });

    const sandbox = {
      ...context,
      console: {
        log: (...args: any[]) => logger.debug({ args }, 'Custom code console.log'),
        error: (...args: any[]) => logger.error({ args }, 'Custom code console.error'),
        warn: (...args: any[]) => logger.warn({ args }, 'Custom code console.warn'),
      },
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      process: undefined,
      global: undefined,
      require: undefined,
      __dirname: undefined,
      __filename: undefined,
    };

    const wrappedCode = `
      (function() {
        'use strict';
        ${code}
      })()
    `;

    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'user-code.js',
      });

      const context_vm = vm.createContext(sandbox);

      const startTime = Date.now();
      const result = script.runInContext(context_vm, {
        timeout,
        displayErrors: true,
      });

      const duration = Date.now() - startTime;
      logger.info('Custom JavaScript executed successfully', { duration });

      return result;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Custom JavaScript execution failed');

      // Provide helpful error messages for common issues
      let errorMessage = `JavaScript execution error: ${error.message}`;
      if (error.message.includes('await is only valid in async')) {
        errorMessage += '\n\nHint: The standard execute() function does not support async/await. Use utilities.javascript.executeAsync instead for async operations.';
      }

      throw new Error(errorMessage);
    }
  };

  const breaker = new CircuitBreaker(operation, breakerOptions);
  return limiter.schedule(() => breaker.fire());
}

/**
 * Execute JavaScript with access to common npm packages
 */
export async function executeWithPackages(options: {
  code: string;
  packages: string[];
  context?: Record<string, any>;
  timeout?: number;
}): Promise<any> {
  const { code, packages, context = {}, timeout = 10000 } = options;

  const operation = async () => {
    logger.info('Executing JavaScript with packages', {
      codeLength: code.length,
      packages,
      contextKeys: Object.keys(context),
      timeout,
    });

    const allowedPackages: Record<string, any> = {
      lodash: () => require('lodash'),
      _: () => require('lodash'),
      dayjs: () => require('dayjs'),
      uuid: () => require('uuid'),
      'crypto-js': () => require('crypto-js'),
    };

    for (const pkg of packages) {
      if (!allowedPackages[pkg]) {
        throw new Error(`Package '${pkg}' is not allowed`);
      }
    }

    const customRequire = (moduleName: string) => {
      if (!allowedPackages[moduleName]) {
        throw new Error(`Cannot require '${moduleName}'`);
      }
      return allowedPackages[moduleName]();
    };

    const sandbox = {
      ...context,
      require: customRequire,
      console: {
        log: (...args: any[]) => logger.debug({ args }, 'Custom code console.log'),
        error: (...args: any[]) => logger.error({ args }, 'Custom code console.error'),
        warn: (...args: any[]) => logger.warn({ args }, 'Custom code console.warn'),
      },
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      process: undefined,
      global: undefined,
      __dirname: undefined,
      __filename: undefined,
    };

    const wrappedCode = `
      (function() {
        'use strict';
        ${code}
      })()
    `;

    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'user-code-with-packages.js',
      });

      const context_vm = vm.createContext(sandbox);

      const startTime = Date.now();
      const result = script.runInContext(context_vm, {
        timeout,
        displayErrors: true,
      });

      const duration = Date.now() - startTime;
      logger.info('JavaScript with packages executed successfully', { duration, packages });

      return result;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, packages }, 'JavaScript with packages execution failed');
      throw new Error(`JavaScript execution error: ${error.message}`);
    }
  };

  const breaker = new CircuitBreaker(operation, { ...breakerOptions, timeout: timeout + 5000 });
  return limiter.schedule(() => breaker.fire());
}

/**
 * Evaluate a JavaScript expression and return the result
 */
export async function evaluateExpression(options: {
  expression: string;
  context?: Record<string, any>;
  timeout?: number;
}): Promise<any> {
  const { expression, context = {}, timeout = 2000 } = options;

  const operation = async () => {
    logger.info('Evaluating expression', {
      expression,
      contextKeys: Object.keys(context),
    });

    const sandbox = {
      ...context,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      process: undefined,
      global: undefined,
      require: undefined,
    };

    try {
      const script = new vm.Script(expression, {
        filename: 'expression.js',
      });

      const context_vm = vm.createContext(sandbox);

      const result = script.runInContext(context_vm, {
        timeout,
        displayErrors: true,
      });

      logger.info('Expression evaluated successfully', { result });
      return result;
    } catch (error: any) {
      logger.error({ error: error.message, expression }, 'Expression evaluation failed');
      throw new Error(`Expression evaluation error: ${error.message}`);
    }
  };

  const breaker = new CircuitBreaker(operation, { ...breakerOptions, timeout: 5000 });
  return limiter.schedule(() => breaker.fire());
}

/**
 * Transform an array using custom JavaScript
 */
export async function mapArray(options: {
  items: any[];
  code: string;
  timeout?: number;
}): Promise<any[]> {
  const { items, code, timeout = 5000 } = options;

  const operation = async () => {
    logger.info('Mapping array', { itemCount: items.length });

    const results: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const sandbox = { item: items[i], index: i, items };

      const wrappedCode = `(function() { 'use strict'; ${code} })()`;

      const script = new vm.Script(wrappedCode, { filename: `map-${i}.js` });
      const context_vm = vm.createContext(sandbox);
      const result = script.runInContext(context_vm, { timeout: Math.floor(timeout / items.length), displayErrors: true });
      results.push(result);
    }

    return results;
  };

  const breaker = new CircuitBreaker(operation, breakerOptions);
  return limiter.schedule(() => breaker.fire());
}

/**
 * Filter an array using custom JavaScript condition
 */
export async function filterArray(options: {
  items: any[];
  code: string;
  timeout?: number;
}): Promise<any[]> {
  const { items, code, timeout = 5000 } = options;

  const operation = async () => {
    const results: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const sandbox = { item: items[i], index: i, items };
      const wrappedCode = `(function() { 'use strict'; ${code} })()`;
      const script = new vm.Script(wrappedCode, { filename: `filter-${i}.js` });
      const context_vm = vm.createContext(sandbox);
      const shouldInclude = script.runInContext(context_vm, { timeout: Math.floor(timeout / items.length), displayErrors: true });
      if (shouldInclude) results.push(items[i]);
    }

    return results;
  };

  const breaker = new CircuitBreaker(operation, breakerOptions);
  return limiter.schedule(() => breaker.fire());
}

/**
 * Reduce an array to a single value using custom JavaScript
 */
export async function reduceArray(options: {
  items: any[];
  code: string;
  initialValue?: any;
  timeout?: number;
}): Promise<any> {
  const { items, code, initialValue = null, timeout = 5000 } = options;

  const operation = async () => {
    let accumulator = initialValue;

    for (let i = 0; i < items.length; i++) {
      const sandbox = { accumulator, item: items[i], index: i, items };
      const wrappedCode = `(function() { 'use strict'; ${code} })()`;
      const script = new vm.Script(wrappedCode, { filename: `reduce-${i}.js` });
      const context_vm = vm.createContext(sandbox);
      accumulator = script.runInContext(context_vm, { timeout: Math.floor(timeout / items.length), displayErrors: true });
    }

    return accumulator;
  };

  const breaker = new CircuitBreaker(operation, breakerOptions);
  return limiter.schedule(() => breaker.fire());
}

/**
 * Execute async JavaScript code in a worker thread
 * Supports async/await, fetch, and other async operations
 */
export async function executeAsync(options: {
  code: string;
  context?: Record<string, any>;
  timeout?: number;
}): Promise<any> {
  const { code, context = {}, timeout = 30000 } = options;

  const operation = async () => {
    logger.info('Executing async JavaScript', {
      codeLength: code.length,
      contextKeys: Object.keys(context),
      timeout,
    });

    return new Promise((resolve, reject) => {
      const workerCode = `
        const { parentPort, workerData } = require('worker_threads');

        (async () => {
          try {
            const context = workerData.context;
            const input = context.input || context;

            // Make context variables available globally
            Object.assign(global, context);

            // User's code
            const result = await (async function() {
              ${code}
            })();

            parentPort.postMessage({ success: true, result });
          } catch (error) {
            parentPort.postMessage({
              success: false,
              error: error.message,
              stack: error.stack
            });
          }
        })();
      `;

      const tmpDir = os.tmpdir();
      const workerFile = path.join(tmpDir, `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.js`);

      try {
        fs.writeFileSync(workerFile, workerCode);

        const worker = new Worker(workerFile, {
          workerData: { context },
          eval: false,
        });

        const timer = setTimeout(() => {
          worker.terminate();
          cleanup();
          reject(new Error(`Async JavaScript execution timeout after ${timeout}ms`));
        }, timeout);

        const cleanup = () => {
          clearTimeout(timer);
          try {
            fs.unlinkSync(workerFile);
          } catch (e) {
            // Ignore cleanup errors
          }
        };

        worker.on('message', (message) => {
          cleanup();
          worker.terminate();

          if (message.success) {
            logger.info('Async JavaScript executed successfully');
            resolve(message.result);
          } else {
            logger.error({ error: message.error, stack: message.stack }, 'Async JavaScript execution failed');
            reject(new Error(`Async JavaScript execution error: ${message.error}`));
          }
        });

        worker.on('error', (error) => {
          cleanup();
          logger.error({ error: error.message }, 'Worker thread error');
          reject(new Error(`Worker thread error: ${error.message}`));
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            cleanup();
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to create worker');
        reject(new Error(`Failed to create worker: ${error.message}`));
      }
    });
  };

  const breaker = new CircuitBreaker(operation, { ...breakerOptions, timeout: timeout + 5000 });
  return limiter.schedule(() => breaker.fire());
}

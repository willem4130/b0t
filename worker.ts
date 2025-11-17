#!/usr/bin/env node
/**
 * Dedicated Workflow Worker for Horizontal Scaling
 *
 * This worker runs independently from the Next.js web server,
 * processing workflows from the Redis queue.
 *
 * Benefits:
 * - Separate workflow processing from web server
 * - Scale workers independently (e.g., 5 web servers, 20 workers)
 * - Better resource isolation
 * - Easier to monitor and scale
 *
 * Usage:
 *   Development: npm run worker
 *   Production: node worker.js (or via Docker/PM2/systemd)
 *
 * Environment Variables:
 *   WORKFLOW_CONCURRENCY - Workflows per worker (default: 50)
 *   DATABASE_URL - PostgreSQL connection string
 *   REDIS_URL - Redis connection string
 *   WORKER_NAME - Worker instance name (default: worker-{hostname}-{pid})
 */

import { initializeWorkflowQueue } from './src/lib/workflows/workflow-queue';
import { workflowScheduler } from './src/lib/workflows/workflow-scheduler';
import { preloadAllModules } from './src/lib/workflows/module-preloader';
import { preloadCredentialCache } from './src/lib/workflows/credential-cache';
import { logger } from './src/lib/logger';
import os from 'os';

// Worker configuration
const workerName = process.env.WORKER_NAME || `worker-${os.hostname()}-${process.pid}`;
const concurrency = parseInt(process.env.WORKFLOW_CONCURRENCY || '50', 10);
const skipModulePreload = process.env.SKIP_MODULE_PRELOAD === 'true';

console.log('╔════════════════════════════════════════╗');
console.log('║   B0T Workflow Worker                  ║');
console.log('╚════════════════════════════════════════╝');
console.log('');
console.log(`Worker: ${workerName}`);
console.log(`Concurrency: ${concurrency} workflows`);
console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('');

async function startWorker() {
  try {
    // Validate required environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is required for worker mode');
    }

    logger.info({ workerName, concurrency }, 'Starting workflow worker');

    // Pre-load all modules to eliminate cold start (skippable for faster startup in dev)
    if (!skipModulePreload) {
      console.log('🔥 Pre-loading workflow modules...');
      const preloadStats = await preloadAllModules();
      console.log(
        `✅ Pre-loaded ${preloadStats.successCount}/${preloadStats.totalModules} modules in ${preloadStats.duration}ms`
      );
      if (preloadStats.failCount > 0) {
        console.log(`⚠️  ${preloadStats.failCount} modules failed to load`);
      }

      // Pre-load credentials for active users
      console.log('🔑 Pre-loading credentials for active users...');
      const credStats = await preloadCredentialCache(100);
      console.log(
        `✅ Pre-loaded credentials for ${credStats.usersPreloaded} users in ${credStats.duration}ms`
      );
    } else {
      console.log('⏭️  Skipping module pre-load (SKIP_MODULE_PRELOAD=true)');
    }

    // Initialize workflow queue (creates worker that processes jobs)
    const queueInitialized = await initializeWorkflowQueue({
      concurrency,
    });

    if (!queueInitialized) {
      throw new Error('Failed to initialize workflow queue');
    }

    logger.info({ workerName }, 'Workflow queue worker initialized');

    // Initialize workflow scheduler (handles cron-triggered workflows)
    await workflowScheduler.initialize();
    logger.info({ workerName }, 'Workflow scheduler initialized');

    console.log('');
    console.log('✅ Worker started successfully!');
    console.log(`🔄 Processing up to ${concurrency} workflows concurrently`);
    console.log('📊 Queue stats available via API endpoint: /api/monitoring/capacity');
    console.log('');
    console.log('Press Ctrl+C to stop worker');
    console.log('');

    // Health check interval (every 30 seconds)
    const healthCheckInterval = setInterval(async () => {
      const { getWorkflowQueueStats } = await import('./src/lib/workflows/workflow-queue');
      const stats = await getWorkflowQueueStats();

      if (stats) {
        logger.info(
          {
            workerName,
            active: stats.active,
            waiting: stats.waiting,
            completed: stats.completed,
            failed: stats.failed,
          },
          'Worker health check'
        );

        // Warn if queue is backing up
        if (stats.waiting > 100) {
          logger.warn(
            { workerName, waiting: stats.waiting },
            'Queue backlog detected - consider scaling up workers'
          );
        }
      }
    }, 30000);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log('');
      logger.info({ workerName, signal }, 'Received shutdown signal');
      console.log('🛑 Shutting down gracefully...');

      clearInterval(healthCheckInterval);

      // Stop accepting new jobs
      workflowScheduler.stop();
      logger.info({ workerName }, 'Workflow scheduler stopped');

      // Wait for active jobs to finish (max 30 seconds)
      console.log('⏳ Waiting for active workflows to finish (max 30s)...');
      const startTime = Date.now();
      const maxWaitTime = 30000;

      while (Date.now() - startTime < maxWaitTime) {
        const { getWorkflowQueueStats } = await import('./src/lib/workflows/workflow-queue');
        const stats = await getWorkflowQueueStats();

        if (!stats || stats.active === 0) {
          break;
        }

        logger.info(
          { workerName, activeWorkflows: stats.active },
          'Waiting for workflows to complete'
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Close queues, workers, and Redis connections
      console.log('🔌 Closing queue connections...');
      const { shutdownQueues } = await import('./src/lib/queue');
      await shutdownQueues();
      logger.info({ workerName }, 'Queue connections closed');

      // Close database pool
      console.log('💾 Closing database connections...');
      const { pool } = await import('./src/lib/db');
      await pool.end();
      logger.info({ workerName }, 'Database pool closed');

      logger.info({ workerName }, 'Worker shutdown complete');
      console.log('✅ Worker stopped successfully');
      process.exit(0);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error({ workerName, error }, 'Uncaught exception in worker');
      console.error('❌ Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(
        { workerName, reason, promise },
        'Unhandled promise rejection in worker'
      );
      console.error('❌ Unhandled rejection:', reason);
      process.exit(1);
    });
  } catch (error) {
    logger.error({ workerName, error }, 'Failed to start worker');
    console.error('❌ Failed to start worker:', error);
    process.exit(1);
  }
}

// Start the worker
startWorker();

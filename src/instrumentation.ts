/**
 * Next.js Instrumentation File
 *
 * This file is used to run code when the server starts.
 * Perfect for initializing scheduled jobs.
 *
 * Automatically chooses between:
 * - BullMQ (persistent jobs) if REDIS_URL is set
 * - node-cron (simple scheduler) if Redis is not available
 *
 * Note: Next.js automatically loads .env files, no need for manual dotenv loading
 */

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeScheduler } = await import('./lib/jobs');
    const { logger } = await import('./lib/logger');

    // Check production environment setup
    const isProduction = process.env.NODE_ENV === 'production';
    const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;

    if (isProduction && isRailway) {
      logger.info('🚂 Railway deployment detected - validating configuration');

      const warnings: string[] = [];

      // Check for PostgreSQL
      if (!process.env.DATABASE_URL) {
        warnings.push('⚠️  WARNING: DATABASE_URL not set - using SQLite (data will be lost on redeploy!)');
        warnings.push('   → Add PostgreSQL: Railway Dashboard → New → Database → Add PostgreSQL');
      } else {
        logger.info('✅ PostgreSQL connected');
      }

      // Check for Redis
      if (!process.env.REDIS_URL) {
        warnings.push('⚠️  WARNING: REDIS_URL not set - jobs will be lost on restart!');
        warnings.push('   → Add Redis: Railway Dashboard → New → Database → Add Redis');
      } else {
        logger.info('✅ Redis URL configured');
        // Test Redis connection
        try {
          const { Redis } = await import('ioredis');
          const testRedis = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            connectTimeout: 5000,
            lazyConnect: true,
          });
          await testRedis.connect();
          await testRedis.ping();
          logger.info('✅ Redis connection verified');
          await testRedis.quit();
        } catch (error) {
          logger.error({ error }, '❌ Redis connection failed - check REDIS_URL is correct');
          warnings.push('⚠️  Redis connection failed - verify REDIS_URL is correct');
        }
      }

      // Log all warnings
      if (warnings.length > 0) {
        logger.warn('\n' + warnings.join('\n'));
        logger.warn('📖 See DEPLOYMENT.md for setup instructions');
      } else {
        logger.info('✅ All production services configured correctly');
      }
    }

    // Initialize scheduler in background to avoid blocking
    initializeScheduler().catch(error => {
      logger.error({ error }, 'Failed to initialize scheduler');
    });

    // Initialize workflow queue and scheduler
    const { initializeWorkflowQueue } = await import('./lib/workflows/workflow-queue');
    const { workflowScheduler } = await import('./lib/workflows/workflow-scheduler');
    const { preloadAllModules } = await import('./lib/workflows/module-preloader');
    const { preloadCredentialCache } = await import('./lib/workflows/credential-cache');

    // Pre-load all workflow modules (unless explicitly disabled)
    if (process.env.SKIP_MODULE_PRELOAD !== 'true') {
      preloadAllModules().then(stats => {
        // Only log in production or if explicitly requested
        if (process.env.NODE_ENV !== 'development' || process.env.LOG_PRELOAD === 'true') {
          logger.info(
            {
              totalModules: stats.totalModules,
              successCount: stats.successCount,
              failCount: stats.failCount,
              duration: stats.duration
            },
            `✅ Pre-loaded ${stats.successCount} workflow modules in ${stats.duration}ms`
          );
        }

        // After modules are loaded, pre-load credentials for active users
        return preloadCredentialCache(100);
      }).then(credStats => {
        if (credStats && (process.env.NODE_ENV !== 'development' || process.env.LOG_PRELOAD === 'true')) {
          logger.info(
            {
              usersPreloaded: credStats.usersPreloaded,
              errors: credStats.errors,
              duration: credStats.duration
            },
            `✅ Pre-loaded credentials for ${credStats.usersPreloaded} active users in ${credStats.duration}ms`
          );
        }
      }).catch(error => {
        logger.error({ error }, 'Pre-loading failed (non-fatal)');
      });
    }

    // Initialize workflow queue
    // Concurrency automatically configured based on environment:
    // - Development: 20 concurrent workflows (WORKFLOW_CONCURRENCY env var or default)
    // - Production: 100 concurrent workflows (or WORKFLOW_CONCURRENCY env var)
    // - Worker mode: Configurable per worker instance
    //
    // Note: Queue initialization runs in background, don't await the worker
    initializeWorkflowQueue().then(queueInitialized => {
      // Only log in production or if explicitly requested
      if (process.env.NODE_ENV !== 'development' || process.env.LOG_QUEUE === 'true') {
        if (queueInitialized) {
          const concurrency = parseInt(
            process.env.WORKFLOW_CONCURRENCY ||
            (process.env.NODE_ENV === 'production' ? '100' : '20'),
            10
          );
          logger.info(
            { concurrency },
            '✅ Workflow queue initialized (Redis-backed)'
          );
        } else {
          logger.info('⚠️  Workflow queue disabled (no Redis) - using direct execution');
        }
      }
    }).catch(error => {
      logger.error({ error }, 'Failed to initialize workflow queue');
    });

    // Initialize workflow scheduler (for cron triggers)
    // Error logging handled inside initialize()
    workflowScheduler.initialize();
  }
}

import { Queue, Worker, QueueOptions, WorkerOptions, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * BullMQ Queue Setup with Redis
 *
 * Provides persistent job queue with automatic retries, backoff, and job history.
 * Replaces node-cron for production-ready job scheduling with recovery capabilities.
 *
 * Features:
 * - Persistent jobs (survives restarts)
 * - Automatic retries with exponential backoff
 * - Job history and status tracking
 * - Dead letter queue for failed jobs
 * - Rate limiting per queue
 * - Priority queues
 */

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,    // Recommended for BullMQ
  // Optional: Add password if Redis requires auth
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
};

/**
 * Redis connection singletons to prevent memory leaks
 * Each type of connection (queue vs worker) gets its own instance
 */
let queueRedisConnection: Redis | null = null;
let workerRedisConnection: Redis | null = null;

// Alternative: Use REDIS_URL if provided (e.g., from Railway, Upstash)
const createRedisConnection = (): Redis => {
  if (process.env.REDIS_URL) {
    const redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 1000, 5000);
        logger.warn({ attempt: times, delay }, 'Retrying Redis connection');
        return delay;
      },
    });

    // Add error listener for critical issues only
    redis.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    return redis;
  }

  // Only connect to localhost if explicitly configured
  if (process.env.REDIS_HOST || process.env.REDIS_PORT) {
    return new Redis(redisConfig);
  }

  // No Redis configured - throw error to prevent silent failures
  throw new Error('Redis not configured. Set REDIS_URL or REDIS_HOST/REDIS_PORT environment variables.');
};

// Get or create Redis connection for queues (singleton pattern)
const getQueueRedisConnection = (): Redis => {
  if (!queueRedisConnection) {
    queueRedisConnection = createRedisConnection();
    // Only log in production or if explicitly requested
    if (process.env.NODE_ENV === 'production' || process.env.LOG_REDIS_CONFIG === 'true') {
      logger.info('Created queue Redis connection');
    }
  }
  return queueRedisConnection;
};

// Get or create Redis connection for workers (singleton pattern)
const getWorkerRedisConnection = (): Redis => {
  if (!workerRedisConnection) {
    workerRedisConnection = createRedisConnection();
    // Only log in production or if explicitly requested
    if (process.env.NODE_ENV === 'production' || process.env.LOG_REDIS_CONFIG === 'true') {
      logger.info('Created worker Redis connection');
    }
  }
  return workerRedisConnection;
};

// Default queue options with retry logic (uses singleton connection)
const getDefaultQueueOptions = (): QueueOptions => ({
  connection: getQueueRedisConnection(),
  defaultJobOptions: {
    attempts: 3,               // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',     // Exponential backoff (2^n * delay)
      delay: 5000,             // Initial delay: 5 seconds
    },
    removeOnComplete: {
      age: 86400,              // Keep completed jobs for 24 hours
      count: 1000,             // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 604800,             // Keep failed jobs for 7 days
      count: 5000,             // Keep max 5000 failed jobs
    },
  },
});

// Default worker options
// Reduced from 50 to 25 to prevent DB connection pool exhaustion
// and better match DB pool size (default 20-30)
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '25', 10);

const defaultWorkerOptions: Omit<WorkerOptions, 'connection'> = {
  autorun: false,              // Start workers manually
  concurrency: WORKER_CONCURRENCY, // Reduced from 50 to 25 to match DB pool capacity
  limiter: {
    max: 600,                  // Max 600 jobs per minute (10/sec rate limit)
    duration: 60000,           // Per minute (rate limiting)
  },
};

// Log queue configuration on startup
logger.info({
  concurrency: WORKER_CONCURRENCY,
  maxJobsPerMinute: 600,
  optimization: 'WORKER_CONCURRENCY_BALANCED'
}, `✅ BullMQ default worker config: ${WORKER_CONCURRENCY} concurrent jobs, 600/min rate limit`);

/**
 * Queue Registry
 * Keep track of all queues and workers for cleanup
 */
export const queues = new Map<string, Queue>();
export const workers = new Map<string, Worker>();

/**
 * Create a new queue for job processing
 */
export function createQueue(
  name: string,
  options?: Partial<QueueOptions>
): Queue {
  if (queues.has(name)) {
    logger.warn({ queue: name }, 'Queue already exists, returning existing queue');
    return queues.get(name)!;
  }

  const queue = new Queue(name, {
    ...getDefaultQueueOptions(),
    ...options,
  });

  queues.set(name, queue);
  return queue;
}

/**
 * Create a worker to process jobs from a queue
 */
export function createWorker<T = unknown, R = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<R>,
  options?: Partial<WorkerOptions>
): Worker {
  if (workers.has(queueName)) {
    logger.warn({ queue: queueName }, 'Worker already exists for queue');
    return workers.get(queueName)!;
  }

  const worker = new Worker(
    queueName,
    async (job: Job<T>) => {
      logger.info(
        { jobId: job.id, jobName: job.name, attempt: job.attemptsMade + 1 },
        `Processing job: ${job.name}`
      );

      try {
        const result = await processor(job);
        logger.info(
          { jobId: job.id, jobName: job.name },
          `Completed job: ${job.name}`
        );
        return result;
      } catch (error) {
        logger.error(
          { jobId: job.id, jobName: job.name, error, attempt: job.attemptsMade + 1 },
          `Job failed: ${job.name}`
        );
        throw error;
      }
    },
    {
      connection: getWorkerRedisConnection(),
      ...defaultWorkerOptions,
      ...options,
    }
  );

  // Event listeners for worker lifecycle
  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, jobName: job.name, duration: Date.now() - job.timestamp },
      'Job completed successfully'
    );
  });

  worker.on('failed', (job, error) => {
    if (job) {
      logger.error(
        { jobId: job.id, jobName: job.name, error, attempts: job.attemptsMade },
        'Job failed after retry attempts'
      );
    }
  });

  worker.on('error', (error) => {
    logger.error({ error }, 'Worker error');
  });

  workers.set(queueName, worker);
  return worker;
}

/**
 * Helper: Add a job to a queue
 */
export async function addJob<T>(
  queueName: string,
  jobName: string,
  data: T,
  options?: {
    delay?: number;           // Delay in milliseconds before processing
    priority?: number;        // Lower number = higher priority
    repeat?: {               // Cron-style repeating jobs
      pattern?: string;      // Cron pattern (e.g., '0 */2 * * *')
      every?: number;        // Repeat every N milliseconds
    };
  }
) {
  const queue = queues.get(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found. Create it first with createQueue()`);
  }

  const job = await queue.add(jobName, data, options);
  logger.info(
    { queueName, jobId: job.id, jobName },
    'Added job to queue'
  );

  return job;
}

/**
 * Start all registered workers
 */
export async function startAllWorkers() {
  logger.info({ count: workers.size }, 'Starting all workers');

  for (const [name, worker] of workers.entries()) {
    await worker.run();
    logger.info({ worker: name }, 'Worker started');
  }

  logger.info('All workers started');
}

/**
 * Stop all queues and workers gracefully
 * Also closes Redis connections to prevent memory leaks
 */
export async function shutdownQueues() {
  logger.info('Shutting down queues and workers');

  // Close all workers
  for (const [name, worker] of workers.entries()) {
    await worker.close();
    logger.info({ worker: name }, 'Worker closed');
  }

  // Close all queues
  for (const [name, queue] of queues.entries()) {
    await queue.close();
    logger.info({ queue: name }, 'Queue closed');
  }

  workers.clear();
  queues.clear();

  // Close Redis connections
  if (queueRedisConnection) {
    await queueRedisConnection.quit();
    queueRedisConnection = null;
    logger.info('Queue Redis connection closed');
  }

  if (workerRedisConnection) {
    await workerRedisConnection.quit();
    workerRedisConnection = null;
    logger.info('Worker Redis connection closed');
  }

  logger.info('All queues, workers, and connections shut down');
}

/**
 * Example queue names (export for use in job files)
 */
export const QUEUE_NAMES = {
  TWITTER_POST: 'twitter:post',
  TWITTER_REPLY: 'twitter:reply',
  YOUTUBE_COMMENT: 'youtube:comment',
  YOUTUBE_REPLY: 'youtube:reply',
  INSTAGRAM_POST: 'instagram:post',
  AI_GENERATION: 'ai:generation',
  ANALYTICS: 'analytics',
} as const;

/**
 * Example usage:
 *
 * // Create a queue
 * const twitterQueue = createQueue(QUEUE_NAMES.TWITTER_POST);
 *
 * // Create a worker to process jobs
 * createWorker(QUEUE_NAMES.TWITTER_POST, async (job) => {
 *   const { text } = job.data;
 *   await postTweet(text);
 * });
 *
 * // Add a job
 * await addJob(QUEUE_NAMES.TWITTER_POST, 'post-tweet', { text: 'Hello world' });
 *
 * // Start processing
 * await startAllWorkers();
 *
 * // Shutdown on exit
 * process.on('SIGTERM', shutdownQueues);
 */

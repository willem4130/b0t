import cron, { ScheduledTask } from 'node-cron';
import { db } from './db';
import { jobLogsTable } from './schema';
import { logger } from './logger';

export interface ScheduledJob {
  name: string;
  schedule: string; // Cron expression: e.g., '*/5 * * * *' for every 5 minutes
  task: () => void | Promise<void>;
  enabled?: boolean;
}

class Scheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private isInitialized = false;

  /**
   * Register a scheduled job
   * @param job - The job configuration
   *
   * Cron expression format:
   * * * * * *
   * ┬ ┬ ┬ ┬ ┬
   * │ │ │ │ │
   * │ │ │ │ └─── day of week (0 - 7) (0 or 7 is Sunday)
   * │ │ │ └───── month (1 - 12)
   * │ │ └─────── day of month (1 - 31)
   * │ └───────── hour (0 - 23)
   * └─────────── minute (0 - 59)
   *
   * Examples:
   * - '* /5 * * * *' - Every 5 minutes
   * - '0 * * * *' - Every hour at minute 0
   * - '0 0 * * *' - Every day at midnight
   * - '0 9 * * 1' - Every Monday at 9:00 AM
   */
  register(job: ScheduledJob) {
    if (this.jobs.has(job.name)) {
      logger.warn({ jobName: job.name, action: 'job_already_registered' }, `Job "${job.name}" is already registered. Skipping.`);
      return;
    }

    if (job.enabled === false) {
      // Only log in production or if explicitly requested
      if (process.env.NODE_ENV !== 'development' || process.env.LOG_SCHEDULER === 'true') {
        logger.info({ jobName: job.name, action: 'job_disabled' }, `Job "${job.name}" is disabled. Skipping registration.`);
      }
      return;
    }

    if (!cron.validate(job.schedule)) {
      logger.error({ jobName: job.name, schedule: job.schedule, action: 'invalid_cron' }, `Invalid cron expression for job "${job.name}": ${job.schedule}`);
      return;
    }

    const scheduledTask = cron.schedule(
      job.schedule,
      async () => {
        const startTime = Date.now();
        logger.info({ jobName: job.name, action: 'scheduled_job_started' }, `Running scheduled job: ${job.name}`);

        try {
          await job.task();
          const duration = Date.now() - startTime;
          logger.info({ jobName: job.name, duration, action: 'scheduled_job_completed' }, `Completed job: ${job.name} (${duration}ms)`);

          // Log success to database
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db as any).insert(jobLogsTable).values({
              jobName: job.name,
              status: 'success',
              message: `Job completed successfully`,
              duration,
            });
          } catch {
            logger.error({ jobName: job.name, action: 'job_log_failed' }, 'Failed to log job success to database');
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;

          logger.error({ jobName: job.name, error: errorMessage, action: 'scheduled_job_failed' }, `Error in job "${job.name}"`);

          // Log error to database
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db as any).insert(jobLogsTable).values({
              jobName: job.name,
              status: 'error',
              message: errorMessage,
              details: errorStack ? JSON.stringify({ stack: errorStack }) : undefined,
              duration,
            });
          } catch {
            logger.error({ jobName: job.name, action: 'job_log_failed' }, 'Failed to log job error to database');
          }
        }
      }
    );

    // Stop the task initially so it doesn't run until start() is called
    scheduledTask.stop();

    this.jobs.set(job.name, scheduledTask);

    // Only log in production or if explicitly requested
    if (process.env.NODE_ENV !== 'development' || process.env.LOG_SCHEDULER === 'true') {
      logger.info({ jobName: job.name, schedule: job.schedule, action: 'job_registered' }, `Registered job: ${job.name} (${job.schedule})`);
    }
  }

  /**
   * Start all registered jobs
   */
  start() {
    if (this.isInitialized) {
      logger.warn({ action: 'scheduler_already_running' }, 'Scheduler is already running.');
      return;
    }

    // Simple console log for dev, structured log for production
    if (process.env.NODE_ENV === 'development') {
      console.log(`⏰ Scheduler started (${this.jobs.size} jobs)`);
    } else {
      logger.info({ jobCount: this.jobs.size, action: 'scheduler_starting' }, `Starting scheduler with ${this.jobs.size} job(s)...`);
    }

    this.jobs.forEach((task, name) => {
      task.start();
      if (process.env.NODE_ENV !== 'development' || process.env.LOG_SCHEDULER === 'true') {
        logger.info({ jobName: name, action: 'job_started' }, `Started job: ${name}`);
      }
    });

    this.isInitialized = true;
    if (process.env.NODE_ENV !== 'development' || process.env.LOG_SCHEDULER === 'true') {
      logger.info({ action: 'scheduler_started' }, 'Scheduler started successfully');
    }
  }

  /**
   * Stop all registered jobs
   */
  stop() {
    logger.info({ action: 'scheduler_stopping' }, 'Stopping scheduler...');

    this.jobs.forEach((task, name) => {
      task.stop();
      logger.info({ jobName: name, action: 'job_stopped' }, `Stopped job: ${name}`);
    });

    this.isInitialized = false;
    logger.info({ action: 'scheduler_stopped' }, 'Scheduler stopped');
  }

  /**
   * Stop and remove a specific job
   */
  unregister(jobName: string) {
    const task = this.jobs.get(jobName);
    if (!task) {
      logger.warn({ jobName, action: 'job_not_found' }, `Job "${jobName}" not found.`);
      return;
    }

    task.stop();
    this.jobs.delete(jobName);
    logger.info({ jobName, action: 'job_unregistered' }, `Unregistered job: ${jobName}`);
  }

  /**
   * Start a specific job (if it exists and is stopped)
   */
  startJob(jobName: string) {
    const task = this.jobs.get(jobName);
    if (!task) {
      logger.warn({ jobName, action: 'job_not_found' }, `Job "${jobName}" not found.`);
      return false;
    }

    task.start();
    logger.info({ jobName, action: 'job_started' }, `Started job: ${jobName} (will run on schedule)`);
    return true;
  }

  /**
   * Stop a specific job (if it exists and is running)
   */
  stopJob(jobName: string) {
    const task = this.jobs.get(jobName);
    if (!task) {
      logger.warn({ jobName, action: 'job_not_found' }, `Job "${jobName}" not found.`);
      return false;
    }

    task.stop();
    logger.info({ jobName, action: 'job_stopped' }, `Stopped job: ${jobName}`);
    return true;
  }

  /**
   * Dynamically register or update a job with a new schedule
   * Useful for runtime job management
   */
  registerOrUpdate(job: ScheduledJob) {
    // If job already exists, unregister it first
    if (this.jobs.has(job.name)) {
      this.unregister(job.name);
    }

    // Register the new/updated job
    this.register(job);

    // Start the job if enabled (always start in dynamic registration, even if scheduler not globally initialized)
    // This allows API routes to dynamically start jobs without needing the global scheduler state
    if (job.enabled !== false) {
      logger.info({ jobName: job.name, action: 'job_starting_immediately' }, `Starting job immediately: ${job.name}`);
      this.startJob(job.name);

      // Mark scheduler as initialized so future dynamic registrations work
      if (!this.isInitialized) {
        this.isInitialized = true;
        logger.info({ action: 'scheduler_initialized_dynamic' }, 'Scheduler initialized via dynamic job registration');
      }
    }
  }

  /**
   * Check if a specific job is registered
   */
  hasJob(jobName: string): boolean {
    return this.jobs.has(jobName);
  }

  /**
   * Get list of registered jobs
   */
  getJobs() {
    return Array.from(this.jobs.keys());
  }

  /**
   * Check if scheduler is running
   */
  isRunning() {
    return this.isInitialized;
  }
}

// Singleton instance
export const scheduler = new Scheduler();

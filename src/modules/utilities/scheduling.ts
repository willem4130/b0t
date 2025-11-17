import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { addMinutes, addHours, addDays, addWeeks, addMonths, isBefore, isAfter } from 'date-fns';

/**
 * Advanced Scheduling Module
 *
 * Schedule workflow executions with advanced patterns:
 * - One-time scheduled execution
 * - Recurring schedules (cron-like)
 * - Dynamic schedule adjustment
 * - Schedule cancellation
 * - Schedule listing and management
 * - Time window restrictions
 *
 * Perfect for:
 * - Delayed workflow execution
 * - Recurring automations
 * - Time-based triggers
 * - Business hours restrictions
 * - Rate-limited scheduling
 */

// Rate limiter for scheduling operations
const schedulingRateLimiter = createRateLimiter({
  maxConcurrent: 30,
  minTime: 100,
  id: 'scheduling-operations',
});

export interface ScheduledTask {
  id: string;
  name: string;
  workflowId: string;
  data?: Record<string, unknown>;
  schedule: {
    type: 'once' | 'recurring';
    executeAt?: Date;
    cron?: string;
    interval?: {
      value: number;
      unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
    };
    startDate?: Date;
    endDate?: Date;
    timezone?: string;
  };
  restrictions?: {
    daysOfWeek?: number[];
    timeWindow?: { start: string; end: string };
    maxExecutions?: number;
  };
  status: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';
  executionCount: number;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ScheduleOptions {
  name: string;
  workflowId: string;
  data?: Record<string, unknown>;
  executeAt?: Date;
  cron?: string;
  interval?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  };
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
  restrictions?: {
    daysOfWeek?: number[];
    timeWindow?: { start: string; end: string };
    maxExecutions?: number;
  };
  metadata?: Record<string, unknown>;
}

// In-memory storage for scheduled tasks (replace with DB in production)
const scheduleStore = new Map<string, ScheduledTask>();

/**
 * Calculate next execution time based on interval
 */
function calculateNextExecution(
  task: ScheduledTask,
  fromDate: Date = new Date()
): Date | undefined {
  if (task.schedule.type === 'once') {
    return task.schedule.executeAt || undefined;
  }

  let nextDate = fromDate;

  if (task.schedule.interval) {
    const { value, unit } = task.schedule.interval;

    switch (unit) {
      case 'minutes':
        nextDate = addMinutes(nextDate, value);
        break;
      case 'hours':
        nextDate = addHours(nextDate, value);
        break;
      case 'days':
        nextDate = addDays(nextDate, value);
        break;
      case 'weeks':
        nextDate = addWeeks(nextDate, value);
        break;
      case 'months':
        nextDate = addMonths(nextDate, value);
        break;
    }
  }

  // Check if next execution is within bounds
  if (task.schedule.startDate && isBefore(nextDate, task.schedule.startDate)) {
    return task.schedule.startDate;
  }

  if (task.schedule.endDate && isAfter(nextDate, task.schedule.endDate)) {
    return undefined;
  }

  // Apply day of week restrictions
  if (task.restrictions?.daysOfWeek) {
    const dayOfWeek = nextDate.getDay();
    if (!task.restrictions.daysOfWeek.includes(dayOfWeek)) {
      // Find next valid day
      const daysToAdd = task.restrictions.daysOfWeek
        .map(d => (d - dayOfWeek + 7) % 7)
        .filter(d => d > 0)
        .sort((a, b) => a - b)[0] || 7;

      nextDate = addDays(nextDate, daysToAdd);
    }
  }

  return nextDate;
}

/**
 * Check if current time is within allowed time window
 */
function isWithinTimeWindow(date: Date, timeWindow: { start: string; end: string }): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentTime = hours * 60 + minutes;

  const [startHours, startMinutes] = timeWindow.start.split(':').map(Number);
  const startTime = startHours * 60 + startMinutes;

  const [endHours, endMinutes] = timeWindow.end.split(':').map(Number);
  const endTime = endHours * 60 + endMinutes;

  return currentTime >= startTime && currentTime <= endTime;
}

/**
 * Internal function to create schedule
 */
async function createScheduleInternal(options: ScheduleOptions): Promise<ScheduledTask> {
  logger.info({ name: options.name, workflowId: options.workflowId }, 'Creating schedule');

  const id = uuidv4();
  const createdAt = new Date();

  // Determine schedule type
  const type = options.executeAt ? 'once' : 'recurring';

  const task: ScheduledTask = {
    id,
    name: options.name,
    workflowId: options.workflowId,
    data: options.data,
    schedule: {
      type,
      executeAt: options.executeAt,
      cron: options.cron,
      interval: options.interval,
      startDate: options.startDate,
      endDate: options.endDate,
      timezone: options.timezone,
    },
    restrictions: options.restrictions,
    status: 'active',
    executionCount: 0,
    createdAt,
    metadata: options.metadata,
  };

  // Calculate next execution time
  task.nextExecutionAt = calculateNextExecution(task, options.startDate || createdAt);

  if (!task.nextExecutionAt) {
    throw new Error('Unable to calculate next execution time');
  }

  scheduleStore.set(id, task);

  logger.info({ scheduleId: id, nextExecution: task.nextExecutionAt }, 'Schedule created');

  return task;
}

const createScheduleWithBreaker = createCircuitBreaker(createScheduleInternal, {
  timeout: 5000,
  name: 'create-schedule',
});

const createScheduleRateLimited = withRateLimit(
  async (options: ScheduleOptions) => createScheduleWithBreaker.fire(options),
  schedulingRateLimiter
);

/**
 * Create a scheduled task
 */
export async function createSchedule(options: ScheduleOptions): Promise<ScheduledTask> {
  return await createScheduleRateLimited(options);
}

/**
 * Schedule a one-time execution
 */
export async function scheduleOnce(
  name: string,
  workflowId: string,
  executeAt: Date,
  data?: Record<string, unknown>
): Promise<ScheduledTask> {
  logger.info({ name, workflowId, executeAt }, 'Scheduling one-time execution');

  return createSchedule({
    name,
    workflowId,
    executeAt,
    data,
  });
}

/**
 * Schedule a recurring execution
 */
export async function scheduleRecurring(
  name: string,
  workflowId: string,
  interval: { value: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' },
  options?: {
    startDate?: Date;
    endDate?: Date;
    data?: Record<string, unknown>;
    restrictions?: ScheduledTask['restrictions'];
  }
): Promise<ScheduledTask> {
  logger.info({ name, workflowId, interval }, 'Scheduling recurring execution');

  return createSchedule({
    name,
    workflowId,
    interval,
    startDate: options?.startDate,
    endDate: options?.endDate,
    data: options?.data,
    restrictions: options?.restrictions,
  });
}

/**
 * Get scheduled task by ID
 */
export async function getSchedule(scheduleId: string): Promise<ScheduledTask | null> {
  logger.info({ scheduleId }, 'Fetching schedule');

  const task = scheduleStore.get(scheduleId);

  if (!task) {
    logger.warn({ scheduleId }, 'Schedule not found');
    return null;
  }

  return task;
}

/**
 * Update schedule
 */
export async function updateSchedule(
  scheduleId: string,
  updates: Partial<Pick<ScheduledTask, 'name' | 'data' | 'schedule' | 'restrictions' | 'metadata'>>
): Promise<ScheduledTask> {
  logger.info({ scheduleId, updates }, 'Updating schedule');

  const task = await getSchedule(scheduleId);

  if (!task) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  // Apply updates
  if (updates.name) task.name = updates.name;
  if (updates.data) task.data = updates.data;
  if (updates.schedule) task.schedule = { ...task.schedule, ...updates.schedule };
  if (updates.restrictions) task.restrictions = updates.restrictions;
  if (updates.metadata) task.metadata = { ...task.metadata, ...updates.metadata };

  // Recalculate next execution if schedule changed
  if (updates.schedule) {
    task.nextExecutionAt = calculateNextExecution(task);
  }

  scheduleStore.set(scheduleId, task);

  logger.info({ scheduleId }, 'Schedule updated');

  return task;
}

/**
 * Cancel a scheduled task
 */
export async function cancelSchedule(scheduleId: string): Promise<ScheduledTask> {
  logger.info({ scheduleId }, 'Cancelling schedule');

  const task = await getSchedule(scheduleId);

  if (!task) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  task.status = 'cancelled';
  task.nextExecutionAt = undefined;

  scheduleStore.set(scheduleId, task);

  logger.info({ scheduleId }, 'Schedule cancelled');

  return task;
}

/**
 * Pause a scheduled task
 */
export async function pauseSchedule(scheduleId: string): Promise<ScheduledTask> {
  logger.info({ scheduleId }, 'Pausing schedule');

  const task = await getSchedule(scheduleId);

  if (!task) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  if (task.status !== 'active') {
    throw new Error(`Cannot pause schedule with status ${task.status}`);
  }

  task.status = 'paused';

  scheduleStore.set(scheduleId, task);

  logger.info({ scheduleId }, 'Schedule paused');

  return task;
}

/**
 * Resume a paused schedule
 */
export async function resumeSchedule(scheduleId: string): Promise<ScheduledTask> {
  logger.info({ scheduleId }, 'Resuming schedule');

  const task = await getSchedule(scheduleId);

  if (!task) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  if (task.status !== 'paused') {
    throw new Error(`Cannot resume schedule with status ${task.status}`);
  }

  task.status = 'active';
  task.nextExecutionAt = calculateNextExecution(task);

  scheduleStore.set(scheduleId, task);

  logger.info({ scheduleId, nextExecution: task.nextExecutionAt }, 'Schedule resumed');

  return task;
}

/**
 * Mark schedule as executed and calculate next execution
 */
export async function markScheduleExecuted(scheduleId: string): Promise<ScheduledTask> {
  logger.info({ scheduleId }, 'Marking schedule as executed');

  const task = await getSchedule(scheduleId);

  if (!task) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  task.executionCount++;
  task.lastExecutedAt = new Date();

  // Check if max executions reached
  if (task.restrictions?.maxExecutions && task.executionCount >= task.restrictions.maxExecutions) {
    task.status = 'completed';
    task.nextExecutionAt = undefined;

    logger.info({ scheduleId, executionCount: task.executionCount }, 'Schedule completed (max executions reached)');
  } else if (task.schedule.type === 'once') {
    task.status = 'completed';
    task.nextExecutionAt = undefined;

    logger.info({ scheduleId }, 'One-time schedule completed');
  } else {
    // Calculate next execution for recurring task
    task.nextExecutionAt = calculateNextExecution(task);

    if (!task.nextExecutionAt) {
      task.status = 'completed';
      logger.info({ scheduleId }, 'Recurring schedule completed (end date reached)');
    }
  }

  scheduleStore.set(scheduleId, task);

  return task;
}

/**
 * List scheduled tasks with filters
 */
export async function listSchedules(filters?: {
  workflowId?: string;
  status?: ScheduledTask['status'];
  limit?: number;
}): Promise<ScheduledTask[]> {
  logger.info({ filters }, 'Listing schedules');

  let tasks = Array.from(scheduleStore.values());

  if (filters?.workflowId) {
    tasks = tasks.filter(t => t.workflowId === filters.workflowId);
  }

  if (filters?.status) {
    tasks = tasks.filter(t => t.status === filters.status);
  }

  // Sort by next execution time
  tasks.sort((a, b) => {
    if (!a.nextExecutionAt) return 1;
    if (!b.nextExecutionAt) return -1;
    return a.nextExecutionAt.getTime() - b.nextExecutionAt.getTime();
  });

  if (filters?.limit) {
    tasks = tasks.slice(0, filters.limit);
  }

  logger.info({ count: tasks.length }, 'Schedules listed');

  return tasks;
}

/**
 * Get schedules due for execution
 */
export async function getDueSchedules(asOf: Date = new Date()): Promise<ScheduledTask[]> {
  logger.info({ asOf }, 'Fetching due schedules');

  const tasks = Array.from(scheduleStore.values());

  const dueTasks = tasks.filter(task => {
    if (task.status !== 'active') return false;
    if (!task.nextExecutionAt) return false;
    if (isAfter(task.nextExecutionAt, asOf)) return false;

    // Check time window restriction
    if (task.restrictions?.timeWindow) {
      if (!isWithinTimeWindow(asOf, task.restrictions.timeWindow)) {
        return false;
      }
    }

    return true;
  });

  logger.info({ count: dueTasks.length }, 'Due schedules fetched');

  return dueTasks;
}

/**
 * Get schedule statistics
 */
export async function getScheduleStats(workflowId?: string): Promise<{
  total: number;
  active: number;
  paused: number;
  completed: number;
  cancelled: number;
  totalExecutions: number;
  nextExecutionIn?: number;
}> {
  logger.info({ workflowId }, 'Fetching schedule statistics');

  let tasks = Array.from(scheduleStore.values());

  if (workflowId) {
    tasks = tasks.filter(t => t.workflowId === workflowId);
  }

  const active = tasks.filter(t => t.status === 'active').length;
  const paused = tasks.filter(t => t.status === 'paused').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const cancelled = tasks.filter(t => t.status === 'cancelled').length;
  const totalExecutions = tasks.reduce((sum, t) => sum + t.executionCount, 0);

  // Find next execution time
  const activeTasks = tasks.filter(t => t.status === 'active' && t.nextExecutionAt);
  const nextExecution = activeTasks.length > 0
    ? Math.min(...activeTasks.map(t => t.nextExecutionAt!.getTime()))
    : undefined;

  const nextExecutionIn = nextExecution ? nextExecution - Date.now() : undefined;

  return {
    total: tasks.length,
    active,
    paused,
    completed,
    cancelled,
    totalExecutions,
    nextExecutionIn,
  };
}

/**
 * Cleanup completed and cancelled schedules
 */
export async function cleanupSchedules(olderThanDays: number = 30): Promise<number> {
  logger.info({ olderThanDays }, 'Cleaning up old schedules');

  const cutoffDate = addDays(new Date(), -olderThanDays);
  let cleanedCount = 0;

  for (const [id, task] of scheduleStore.entries()) {
    if (
      (task.status === 'completed' || task.status === 'cancelled') &&
      isBefore(task.createdAt, cutoffDate)
    ) {
      scheduleStore.delete(id);
      cleanedCount++;
    }
  }

  logger.info({ cleanedCount }, 'Old schedules cleaned up');

  return cleanedCount;
}

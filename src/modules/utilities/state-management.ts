import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * State Management Module
 *
 * Persist and manage workflow state across executions:
 * - Save workflow state (key-value store)
 * - Load workflow state
 * - Update partial state
 * - Clear state
 * - State versioning and history
 * - State expiration and cleanup
 *
 * Perfect for:
 * - Multi-step workflows that need to remember data
 * - Resumable workflows after failures
 * - Sharing data between workflow runs
 * - Stateful automations
 * - Checkpointing long-running processes
 */

// Rate limiter for state operations
const stateRateLimiter = createRateLimiter({
  maxConcurrent: 50,
  minTime: 50,
  id: 'state-management',
});

export interface WorkflowState {
  workflowId: string;
  key: string;
  value: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface StateHistory {
  workflowId: string;
  key: string;
  version: number;
  value: unknown;
  timestamp: Date;
  operation: 'create' | 'update' | 'delete';
}

// In-memory state storage (replace with Redis/DB in production)
const stateStore = new Map<string, WorkflowState>();
const stateHistoryStore = new Map<string, StateHistory[]>();

/**
 * Generate state key
 */
function getStateKey(workflowId: string, key: string): string {
  return `${workflowId}:${key}`;
}

/**
 * Internal function to save state
 */
async function saveStateInternal(
  workflowId: string,
  key: string,
  value: unknown,
  options?: {
    expiresInMinutes?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<WorkflowState> {
  logger.info({ workflowId, key }, 'Saving workflow state');

  const stateKey = getStateKey(workflowId, key);
  const existingState = stateStore.get(stateKey);
  const now = new Date();

  const state: WorkflowState = {
    workflowId,
    key,
    value,
    version: existingState ? existingState.version + 1 : 1,
    createdAt: existingState?.createdAt || now,
    updatedAt: now,
    expiresAt: options?.expiresInMinutes
      ? new Date(now.getTime() + options.expiresInMinutes * 60 * 1000)
      : existingState?.expiresAt,
    metadata: options?.metadata,
  };

  stateStore.set(stateKey, state);

  // Add to history
  const history: StateHistory = {
    workflowId,
    key,
    version: state.version,
    value,
    timestamp: now,
    operation: existingState ? 'update' : 'create',
  };

  const historyKey = getStateKey(workflowId, key);
  const existingHistory = stateHistoryStore.get(historyKey) || [];
  existingHistory.push(history);

  // Keep only last 10 versions
  if (existingHistory.length > 10) {
    existingHistory.shift();
  }

  stateHistoryStore.set(historyKey, existingHistory);

  logger.info({ workflowId, key, version: state.version }, 'Workflow state saved');

  return state;
}

const saveStateWithBreaker = createCircuitBreaker(saveStateInternal, {
  timeout: 5000,
  name: 'save-state',
});

const saveStateRateLimited = withRateLimit(
  async (
    workflowId: string,
    key: string,
    value: unknown,
    options?: {
      expiresInMinutes?: number;
      metadata?: Record<string, unknown>;
    }
  ) => saveStateWithBreaker.fire(workflowId, key, value, options),
  stateRateLimiter
);

/**
 * Save workflow state
 */
export async function saveState(
  workflowId: string,
  key: string,
  value: unknown,
  options?: {
    expiresInMinutes?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<WorkflowState> {
  return await saveStateRateLimited(workflowId, key, value, options);
}

/**
 * Load workflow state
 */
export async function loadState<T = unknown>(
  workflowId: string,
  key: string
): Promise<T | null> {
  logger.info({ workflowId, key }, 'Loading workflow state');

  const stateKey = getStateKey(workflowId, key);
  const state = stateStore.get(stateKey);

  if (!state) {
    logger.warn({ workflowId, key }, 'Workflow state not found');
    return null;
  }

  // Check if expired
  if (state.expiresAt && new Date() > state.expiresAt) {
    logger.info({ workflowId, key }, 'Workflow state expired');
    stateStore.delete(stateKey);
    return null;
  }

  logger.info({ workflowId, key, version: state.version }, 'Workflow state loaded');

  return state.value as T;
}

/**
 * Get full state object (including metadata)
 */
export async function getState(
  workflowId: string,
  key: string
): Promise<WorkflowState | null> {
  logger.info({ workflowId, key }, 'Getting workflow state object');

  const stateKey = getStateKey(workflowId, key);
  const state = stateStore.get(stateKey);

  if (!state) {
    logger.warn({ workflowId, key }, 'Workflow state not found');
    return null;
  }

  // Check if expired
  if (state.expiresAt && new Date() > state.expiresAt) {
    logger.info({ workflowId, key }, 'Workflow state expired');
    stateStore.delete(stateKey);
    return null;
  }

  return state;
}

/**
 * Update state (merge with existing)
 */
export async function updateState<T extends Record<string, unknown>>(
  workflowId: string,
  key: string,
  updates: Partial<T>
): Promise<WorkflowState> {
  logger.info({ workflowId, key, updates }, 'Updating workflow state');

  const existingValue = await loadState<T>(workflowId, key);

  if (!existingValue || typeof existingValue !== 'object') {
    throw new Error(`Cannot update state ${key} - not found or not an object`);
  }

  const mergedValue = {
    ...(existingValue as object),
    ...updates,
  };

  return await saveState(workflowId, key, mergedValue);
}

/**
 * Delete workflow state
 */
export async function deleteState(workflowId: string, key: string): Promise<boolean> {
  logger.info({ workflowId, key }, 'Deleting workflow state');

  const stateKey = getStateKey(workflowId, key);
  const deleted = stateStore.delete(stateKey);

  if (deleted) {
    // Add to history
    const history: StateHistory = {
      workflowId,
      key,
      version: 0,
      value: null,
      timestamp: new Date(),
      operation: 'delete',
    };

    const historyKey = getStateKey(workflowId, key);
    const existingHistory = stateHistoryStore.get(historyKey) || [];
    existingHistory.push(history);
    stateHistoryStore.set(historyKey, existingHistory);

    logger.info({ workflowId, key }, 'Workflow state deleted');
  } else {
    logger.warn({ workflowId, key }, 'Workflow state not found for deletion');
  }

  return deleted;
}

/**
 * Clear all state for a workflow
 */
export async function clearWorkflowState(workflowId: string): Promise<number> {
  logger.info({ workflowId }, 'Clearing all workflow state');

  let clearCount = 0;

  for (const [stateKey, state] of stateStore.entries()) {
    if (state.workflowId === workflowId) {
      stateStore.delete(stateKey);
      clearCount++;
    }
  }

  logger.info({ workflowId, clearCount }, 'Workflow state cleared');

  return clearCount;
}

/**
 * List all state keys for a workflow
 */
export async function listStateKeys(workflowId: string): Promise<string[]> {
  logger.info({ workflowId }, 'Listing workflow state keys');

  const keys: string[] = [];

  for (const state of stateStore.values()) {
    if (state.workflowId === workflowId) {
      // Check if expired
      if (state.expiresAt && new Date() > state.expiresAt) {
        continue;
      }

      keys.push(state.key);
    }
  }

  logger.info({ workflowId, count: keys.length }, 'Workflow state keys listed');

  return keys;
}

/**
 * Get all state for a workflow
 */
export async function getAllState(workflowId: string): Promise<Record<string, unknown>> {
  logger.info({ workflowId }, 'Getting all workflow state');

  const result: Record<string, unknown> = {};

  for (const state of stateStore.values()) {
    if (state.workflowId === workflowId) {
      // Check if expired
      if (state.expiresAt && new Date() > state.expiresAt) {
        continue;
      }

      result[state.key] = state.value;
    }
  }

  logger.info({ workflowId, keyCount: Object.keys(result).length }, 'All workflow state fetched');

  return result;
}

/**
 * Check if state exists
 */
export async function hasState(workflowId: string, key: string): Promise<boolean> {
  logger.info({ workflowId, key }, 'Checking if workflow state exists');

  const state = await loadState(workflowId, key);

  return state !== null;
}

/**
 * Get state with default value
 */
export async function getStateOrDefault<T>(
  workflowId: string,
  key: string,
  defaultValue: T
): Promise<T> {
  logger.info({ workflowId, key }, 'Getting workflow state with default');

  const value = await loadState<T>(workflowId, key);

  if (value === null) {
    logger.info({ workflowId, key }, 'State not found, using default value');
    return defaultValue;
  }

  return value;
}

/**
 * Get state history
 */
export async function getStateHistory(
  workflowId: string,
  key: string,
  limit?: number
): Promise<StateHistory[]> {
  logger.info({ workflowId, key, limit }, 'Fetching state history');

  const historyKey = getStateKey(workflowId, key);
  const history = stateHistoryStore.get(historyKey) || [];

  // Sort by timestamp descending (newest first)
  const sortedHistory = [...history].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const result = limit ? sortedHistory.slice(0, limit) : sortedHistory;

  logger.info({ workflowId, key, count: result.length }, 'State history fetched');

  return result;
}

/**
 * Restore state to a previous version
 */
export async function restoreState(
  workflowId: string,
  key: string,
  version: number
): Promise<WorkflowState> {
  logger.info({ workflowId, key, version }, 'Restoring state to previous version');

  const history = await getStateHistory(workflowId, key);
  const targetVersion = history.find(h => h.version === version);

  if (!targetVersion) {
    throw new Error(`Version ${version} not found for state ${key}`);
  }

  if (targetVersion.operation === 'delete') {
    throw new Error(`Cannot restore to deleted version ${version}`);
  }

  return await saveState(workflowId, key, targetVersion.value);
}

/**
 * Increment numeric state
 */
export async function incrementState(
  workflowId: string,
  key: string,
  amount: number = 1
): Promise<number> {
  logger.info({ workflowId, key, amount }, 'Incrementing state value');

  const currentValue = await loadState<number>(workflowId, key);
  const newValue = (currentValue || 0) + amount;

  await saveState(workflowId, key, newValue);

  logger.info({ workflowId, key, newValue }, 'State value incremented');

  return newValue;
}

/**
 * Append to array state
 */
export async function appendToState<T>(
  workflowId: string,
  key: string,
  item: T
): Promise<T[]> {
  logger.info({ workflowId, key }, 'Appending to state array');

  const currentValue = await loadState<T[]>(workflowId, key);
  const array = Array.isArray(currentValue) ? currentValue : [];

  array.push(item);

  await saveState(workflowId, key, array);

  logger.info({ workflowId, key, arrayLength: array.length }, 'Item appended to state array');

  return array;
}

/**
 * Clean up expired state
 */
export async function cleanupExpiredState(): Promise<number> {
  logger.info('Cleaning up expired state');

  const now = new Date();
  let cleanupCount = 0;

  for (const [stateKey, state] of stateStore.entries()) {
    if (state.expiresAt && now > state.expiresAt) {
      stateStore.delete(stateKey);
      cleanupCount++;
    }
  }

  logger.info({ cleanupCount }, 'Expired state cleaned up');

  return cleanupCount;
}

/**
 * Get state statistics
 */
export async function getStateStats(workflowId?: string): Promise<{
  totalKeys: number;
  workflowCount: number;
  totalSizeEstimate: number;
  expiredKeys: number;
  oldestState?: Date;
  newestState?: Date;
}> {
  logger.info({ workflowId }, 'Fetching state statistics');

  let states = Array.from(stateStore.values());

  if (workflowId) {
    states = states.filter(s => s.workflowId === workflowId);
  }

  const now = new Date();
  const expiredKeys = states.filter(s => s.expiresAt && now > s.expiresAt).length;

  const workflowIds = new Set(states.map(s => s.workflowId));

  const timestamps = states.map(s => s.createdAt.getTime());
  const oldestState = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
  const newestState = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

  // Estimate size (rough calculation)
  const totalSizeEstimate = states.reduce((sum, state) => {
    return sum + JSON.stringify(state.value).length;
  }, 0);

  return {
    totalKeys: states.length,
    workflowCount: workflowIds.size,
    totalSizeEstimate,
    expiredKeys,
    oldestState,
    newestState,
  };
}

/**
 * System Status Tracker
 *
 * Tracks the warming state of the workflow execution engine.
 * Used to display real-time status in the UI header.
 */

export type SystemStatus = 'cold' | 'warming' | 'warm' | 'hot';

export interface SystemStatusInfo {
  status: SystemStatus;
  modulesLoaded: number;
  totalModules: number;
  credentialsCached: number;
  startupTime: number;
  lastCheck: number;
}

/**
 * In-memory status tracking
 * This is updated during startup and can be queried via API
 *
 * NOTE: We use globalThis to persist state across hot-reloads in development
 * This ensures the status survives Turbopack's hot module replacement
 */
const globalForStatus = globalThis as typeof globalThis & {
  _systemStatus?: SystemStatusInfo;
};

if (!globalForStatus._systemStatus) {
  globalForStatus._systemStatus = {
    status: 'cold',
    modulesLoaded: 0,
    totalModules: 0,
    credentialsCached: 0,
    startupTime: Date.now(),
    lastCheck: Date.now(),
  };
}

/**
 * Update system status (called during warming)
 */
export function updateSystemStatus(updates: Partial<SystemStatusInfo>): void {
  globalForStatus._systemStatus = {
    ...globalForStatus._systemStatus!,
    ...updates,
    lastCheck: Date.now(),
  };

  // Auto-calculate status based on loaded modules
  if (updates.modulesLoaded !== undefined && updates.totalModules !== undefined) {
    const loadPercentage = (updates.modulesLoaded / updates.totalModules) * 100;

    if (loadPercentage === 0) {
      globalForStatus._systemStatus.status = 'cold';
    } else if (loadPercentage < 100) {
      globalForStatus._systemStatus.status = 'warming';
    } else if (globalForStatus._systemStatus.credentialsCached > 0) {
      globalForStatus._systemStatus.status = 'hot';
    } else {
      globalForStatus._systemStatus.status = 'warm';
    }
  } else if (updates.status) {
    // Allow manual status override if provided
    globalForStatus._systemStatus.status = updates.status;
  }
}

/**
 * Get current system status
 */
export function getSystemStatus(): SystemStatusInfo {
  return {
    ...globalForStatus._systemStatus!,
    lastCheck: Date.now(),
  };
}

/**
 * Status descriptions for tooltip
 */
export const STATUS_DESCRIPTIONS: Record<SystemStatus, string> = {
  cold: 'System starting up - First workflow may take 1-3s longer',
  warming: 'Loading workflow modules - Performance improving',
  warm: 'All modules loaded - Workflows ready to execute',
  hot: 'Fully optimized - Modules + credentials cached',
};

/**
 * Get badge color for status
 */
export function getStatusColor(status: SystemStatus): string {
  switch (status) {
    case 'cold':
      return 'gray';
    case 'warming':
      return 'yellow';
    case 'warm':
      return 'green';
    case 'hot':
      return 'blue';
    default:
      return 'gray';
  }
}

/**
 * Get badge label for status
 */
export function getStatusLabel(status: SystemStatus): string {
  switch (status) {
    case 'cold':
      return 'Cold';
    case 'warming':
      return 'Warming';
    case 'warm':
      return 'Warm';
    case 'hot':
      return 'Hot';
    default:
      return 'Unknown';
  }
}

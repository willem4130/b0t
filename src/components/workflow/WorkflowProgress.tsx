'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { WorkflowExecutionState } from '@/hooks/useWorkflowProgress';
import { cn } from '@/lib/utils';

interface WorkflowProgressProps {
  state: WorkflowExecutionState;
  /**
   * Display mode:
   * - 'compact': Shows only progress bar with current step
   * - 'expanded': Shows full step timeline with details
   */
  mode?: 'compact' | 'expanded';
  className?: string;
}

/**
 * WorkflowProgress Component
 *
 * Displays real-time workflow execution progress with simple progress bar and step count.
 * Matches the existing design system (shadcn/ui + Tailwind).
 */
export function WorkflowProgress({ state, mode = 'compact', className }: WorkflowProgressProps) {
  const { status, currentStep, totalSteps, steps, duration, error } = state;

  // Calculate progress percentage
  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  // Get current step info
  const currentStepInfo = steps[currentStep];
  const currentStepName = currentStepInfo?.module
    ? formatModuleName(currentStepInfo.module)
    : 'Initializing...';

  if (mode === 'compact') {
    return (
      <div className={cn('space-y-2', className)}>
        {/* Progress Bar */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border/30">
          <div
            className={cn(
              'h-full transition-all duration-500 ease-out',
              status === 'running' && 'bg-primary animate-pulse',
              status === 'completed' && 'bg-green-500',
              status === 'failed' && 'bg-destructive'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Status Text */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {status === 'running' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="text-secondary">{currentStepName}</span>
              </>
            )}
            {status === 'completed' && (
              <>
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                <span className="text-secondary">
                  Completed in {formatDuration(duration || 0)}
                </span>
              </>
            )}
            {status === 'failed' && (
              <>
                <XCircle className="h-3 w-3 text-destructive" />
                <span className="text-destructive">{error || 'Failed'}</span>
              </>
            )}
          </div>
          <span className="text-secondary font-medium">
            {completedSteps}/{totalSteps} steps
          </span>
        </div>
      </div>
    );
  }

  // Expanded mode - show progress bar with header
  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'running' && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {status === 'completed' && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
          <span className="text-sm font-medium">
            {status === 'running' && 'Executing workflow...'}
            {status === 'completed' && 'Workflow completed'}
            {status === 'failed' && 'Workflow failed'}
          </span>
        </div>
        <span className="text-xs text-secondary">
          {completedSteps}/{totalSteps} steps
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-border/30">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out',
            status === 'running' && 'bg-primary animate-pulse',
            status === 'completed' && 'bg-green-500',
            status === 'failed' && 'bg-destructive'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Format module path to human-readable name
 * e.g., "social.reddit.getSubredditPosts" -> "Get Subreddit Posts"
 */
function formatModuleName(modulePath: string): string {
  const parts = modulePath.split('.');
  const functionName = parts[parts.length - 1];

  // Convert camelCase to Title Case
  return functionName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

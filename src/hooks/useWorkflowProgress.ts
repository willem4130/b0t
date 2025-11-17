import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Progress Event Types (matches server-side)
 */
export type ProgressEvent =
  | { type: 'workflow_started'; workflowId: string; runId: string; totalSteps: number }
  | { type: 'step_started'; stepId: string; stepIndex: number; totalSteps: number; module: string }
  | { type: 'step_completed'; stepId: string; stepIndex: number; duration: number; output?: unknown }
  | { type: 'step_failed'; stepId: string; stepIndex: number; error: string }
  | { type: 'workflow_completed'; runId: string; duration: number; output?: unknown }
  | { type: 'workflow_failed'; runId: string; error: string; errorStep?: string };

/**
 * Step State for UI rendering
 */
export interface StepState {
  id: string;
  index: number;
  module: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  error?: string;
  output?: unknown;
}

/**
 * Workflow Execution State
 */
export interface WorkflowExecutionState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  currentStep: number;
  totalSteps: number;
  steps: StepState[];
  duration?: number;
  output?: unknown;
  error?: string;
}

/**
 * React hook for subscribing to real-time workflow execution progress
 * Uses Server-Sent Events (SSE) to stream updates from the backend
 *
 * @param workflowId - The ID of the workflow to track
 * @param enabled - Whether to start the workflow execution
 * @param triggerType - The type of trigger (manual, chat, chat-input, etc.)
 * @param triggerData - Optional trigger data for triggers like chat-input
 * @returns Workflow execution state and control functions
 */
export function useWorkflowProgress(
  workflowId: string | null,
  enabled: boolean,
  triggerType?: string,
  triggerData?: Record<string, unknown>
) {
  const [state, setState] = useState<WorkflowExecutionState>({
    status: 'idle',
    currentStep: 0,
    totalSteps: 0,
    steps: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      currentStep: 0,
      totalSteps: 0,
      steps: [],
    });
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !workflowId) {
      disconnect();
      return;
    }

    // Reset state when starting new execution
    setState({
      status: 'running',
      currentStep: 0,
      totalSteps: 0,
      steps: [],
    });

    // Build stream URL with optional trigger data
    const params = new URLSearchParams();
    if (triggerType) {
      params.set('triggerType', triggerType);
    }
    if (triggerData) {
      params.set('triggerData', JSON.stringify(triggerData));
    }
    const streamUrl = `/api/workflows/${workflowId}/stream${params.toString() ? `?${params.toString()}` : ''}`;

    // Create EventSource for SSE connection
    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    // Handle workflow_started event
    eventSource.addEventListener('workflow_started', (e) => {
      const data = JSON.parse(e.data) as Extract<ProgressEvent, { type: 'workflow_started' }>;
      setState((prev) => ({
        ...prev,
        status: 'running',
        totalSteps: data.totalSteps,
        steps: Array.from({ length: data.totalSteps }, (_, i) => ({
          id: `step-${i}`,
          index: i,
          module: '',
          status: 'pending',
        })),
      }));
    });

    // Handle step_started event
    eventSource.addEventListener('step_started', (e) => {
      const data = JSON.parse(e.data) as Extract<ProgressEvent, { type: 'step_started' }>;
      setState((prev) => ({
        ...prev,
        currentStep: data.stepIndex,
        steps: prev.steps.map((step, i) =>
          i === data.stepIndex
            ? { ...step, id: data.stepId, module: data.module, status: 'running' as const }
            : step
        ),
      }));
    });

    // Handle step_completed event
    eventSource.addEventListener('step_completed', (e) => {
      const data = JSON.parse(e.data) as Extract<ProgressEvent, { type: 'step_completed' }>;
      setState((prev) => ({
        ...prev,
        steps: prev.steps.map((step, i) =>
          i === data.stepIndex
            ? {
                ...step,
                status: 'completed' as const,
                duration: data.duration,
                output: data.output,
              }
            : step
        ),
      }));
    });

    // Handle step_failed event
    eventSource.addEventListener('step_failed', (e) => {
      const data = JSON.parse(e.data) as Extract<ProgressEvent, { type: 'step_failed' }>;
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: data.error, // Set workflow-level error from step failure
        steps: prev.steps.map((step, i) =>
          i === data.stepIndex
            ? { ...step, status: 'failed' as const, error: data.error }
            : step
        ),
      }));
    });

    // Handle workflow_completed event
    eventSource.addEventListener('workflow_completed', (e) => {
      const data = JSON.parse(e.data) as Extract<ProgressEvent, { type: 'workflow_completed' }>;
      setState((prev) => ({
        ...prev,
        status: 'completed',
        duration: data.duration,
        output: data.output,
      }));
      disconnect();
    });

    // Handle workflow_failed event
    eventSource.addEventListener('workflow_failed', (e) => {
      const data = JSON.parse(e.data) as Extract<ProgressEvent, { type: 'workflow_failed' }>;
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: data.error,
      }));
      disconnect();
    });

    // Handle errors
    eventSource.addEventListener('error', (e) => {
      console.error('SSE error:', e);
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: 'Connection lost',
      }));
      disconnect();
    });

    // Cleanup on unmount or when enabled changes
    return () => {
      disconnect();
    };
  }, [workflowId, enabled, triggerType, triggerData, disconnect]);

  return {
    state,
    reset,
    disconnect,
  };
}

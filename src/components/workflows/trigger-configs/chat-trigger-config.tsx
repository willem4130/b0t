'use client';

import { ChatInterface } from '../chat-interface';

interface ChatTriggerConfigProps {
  workflowId: string;
  workflowName: string;
  workflowDescription?: string;
  onConfigChange: (config: Record<string, unknown>) => void;
  onExecute: (triggerData: Record<string, unknown>) => Promise<{ success: boolean; output?: unknown; error?: string }>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export function ChatTriggerConfig({
  workflowId,
  workflowName,
  workflowDescription,
  onFullscreenChange
}: ChatTriggerConfigProps) {
  return (
    <div className="h-full">
      <ChatInterface
        workflowId={workflowId}
        workflowName={workflowName}
        workflowDescription={workflowDescription}
        onFullscreenChange={onFullscreenChange}
      />
    </div>
  );
}

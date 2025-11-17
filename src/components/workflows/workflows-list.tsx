'use client';

import { WorkflowCard } from './workflow-card';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowListItem } from '@/types/workflows';

interface WorkflowsListProps {
  workflows: WorkflowListItem[];
  loading: boolean;
  onWorkflowDeleted: () => void;
  onWorkflowExport: (id: string) => void;
  onWorkflowUpdated?: () => void;
}

export function WorkflowsList({
  workflows,
  loading,
  onWorkflowDeleted,
  onWorkflowExport,
  onWorkflowUpdated,
}: WorkflowsListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border/50 bg-surface/80 backdrop-blur-sm shadow-sm p-4 space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-3/4" />
              <div className="flex gap-1">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>

            {/* Description */}
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />

            {/* Badges */}
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>

            {/* Stats */}
            <div className="space-y-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>

            {/* Buttons */}
            <div className="flex gap-1">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <p className="text-muted-foreground">
          No workflows yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {workflows.map((workflow) => (
        <WorkflowCard
          key={workflow.id}
          workflow={workflow}
          onDeleted={onWorkflowDeleted}
          onExport={onWorkflowExport}
          onUpdated={onWorkflowUpdated}
        />
      ))}
    </div>
  );
}

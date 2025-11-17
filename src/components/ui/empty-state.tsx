'use client';

interface EmptyStateProps {
  icon: string; // Emoji
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-6xl mb-4 animate-bounce-subtle">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-secondary max-w-md mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 transition-colors text-sm font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Preset empty states for common scenarios
export function NoAutomationsState({ onAddFirst }: { onAddFirst?: () => void }) {
  return (
    <EmptyState
      icon="😿"
      title="No automations yet"
      description="This cat is lonely! Create your first automation to get started with social media magic."
      action={onAddFirst ? {
        label: "Add First Automation",
        onClick: onAddFirst
      } : undefined}
    />
  );
}

export function NoDataState() {
  return (
    <EmptyState
      icon="😺"
      title="Nothing here yet"
      description="This cat is patiently waiting for data to appear. Check back soon!"
    />
  );
}

export function NoRepliesState() {
  return (
    <EmptyState
      icon="😸"
      title="No replies yet"
      description="The cat hasn't replied to any tweets yet. Enable the automation or click Test to get started!"
    />
  );
}

export function NoLimitsDataState() {
  return (
    <EmptyState
      icon="😼"
      title="No rate limit data"
      description="The cat is watching your API usage. Data will appear here once you start using the platform APIs."
    />
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="😾"
      title="Oops! Something went wrong"
      description={message || "The cat knocked something over. Don't worry, we can fix this!"}
      action={onRetry ? {
        label: "Try Again",
        onClick: onRetry
      } : undefined}
    />
  );
}

export function LoadingState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-6xl mb-4 animate-pulse">😴</div>
      <p className="text-sm text-secondary">{message || "Loading..."}</p>
    </div>
  );
}

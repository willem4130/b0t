'use client';

import { CredentialCard } from './credential-card';
import { Skeleton } from '@/components/ui/skeleton';
import { CredentialListItem } from '@/types/workflows';

interface CredentialsListProps {
  credentials: CredentialListItem[];
  loading: boolean;
  onCredentialDeleted: () => void;
  onCredentialUpdated?: () => void;
}

export function CredentialsList({
  credentials,
  loading,
  onCredentialDeleted,
  onCredentialUpdated,
}: CredentialsListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (credentials.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <p className="text-muted-foreground">
          No credentials yet. Add one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {credentials.map((credential) => (
        <CredentialCard
          key={credential.id}
          credential={credential}
          onDeleted={onCredentialDeleted}
          onUpdated={onCredentialUpdated}
        />
      ))}
    </div>
  );
}

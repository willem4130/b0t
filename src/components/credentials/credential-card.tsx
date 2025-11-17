'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Key, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PLATFORM_CONFIGS } from '@/lib/workflows/platform-configs';
import { apiClient, APIError } from '@/lib/api-client';

interface CredentialCardProps {
  credential: {
    id: string;
    platform: string;
    name: string;
    type: string;
    createdAt: Date | null;
    lastUsed: Date | null;
  };
  onDeleted: () => void;
  onUpdated?: () => void;
}

export function CredentialCard({ credential, onDeleted, onUpdated }: CredentialCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(credential.name);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleDelete = async () => {
    toast(`Delete "${credential.name}"?`, {
      description: 'This cannot be undone.',
      action: {
        label: 'Delete',
        onClick: () => performDelete(),
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {},
      },
    });
  };

  const performDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/credentials/${credential.id}`);

      toast.success('Credential deleted', {
        description: `"${credential.name}" has been removed.`,
      });
      onDeleted();
    } catch (error) {
      const message = error instanceof APIError ? error.message : 'Failed to delete credential';
      toast.error('Failed to delete credential', {
        description: message,
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      toast.error('Credential name is required');
      return;
    }

    setSaving(true);
    try {
      // Get platform config to know what fields to expect
      const platformConfig = PLATFORM_CONFIGS[credential.platform];
      const isSingleField = platformConfig.fields.length === 1;

      // Prepare the payload
      const payload: { name?: string; value?: string; fields?: Record<string, string> } = {};

      // Only update name if it changed
      if (editName !== credential.name) {
        payload.name = editName;
      }

      // Include credential value/fields if any were provided
      if (Object.keys(editFields).length > 0) {
        if (isSingleField) {
          payload.value = editFields[platformConfig.fields[0].key];
        } else {
          payload.fields = editFields;
        }
      }

      // Only make the request if there's something to update
      if (Object.keys(payload).length === 0) {
        toast.info('No changes to save');
        setEditDialogOpen(false);
        return;
      }

      await apiClient.patch(`/api/credentials/${credential.id}`, payload);

      toast.success('Credential updated');
      setEditDialogOpen(false);
      setEditFields({});
      onUpdated?.();
    } catch (error) {
      const message = error instanceof APIError ? error.message : 'Failed to update credential';
      toast.error('Failed to update credential', {
        description: message,
      });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  };

  const platformConfig = PLATFORM_CONFIGS[credential.platform];

  return (
    <Card className="relative overflow-hidden rounded-lg border-0 bg-gradient-to-br from-primary/5 via-blue-500/3 to-primary/5 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-blue-400 to-primary opacity-80" />
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="card-title">{credential.platform}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditDialogOpen(true)}
              title="Edit credential"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDelete}
              disabled={deleting}
              className="hover:text-destructive"
              title="Delete credential"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">{credential.name}</span>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Type:</span>
            <span className="font-medium">{credential.type}</span>
          </div>
          <div className="flex justify-between">
            <span>Last used:</span>
            <span>{formatDate(credential.lastUsed)}</span>
          </div>
          <div className="flex justify-between">
            <span>Created:</span>
            <span>{formatDate(credential.createdAt)}</span>
          </div>
        </div>
      </CardContent>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Credential</DialogTitle>
            <DialogDescription>
              Update the name or value of this credential.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Credential name"
                disabled={saving}
              />
            </div>

            {/* Dynamic fields based on platform configuration */}
            {platformConfig?.fields.map((fieldConfig) => (
              <div key={fieldConfig.key} className="space-y-2">
                <Label htmlFor={fieldConfig.key}>
                  {fieldConfig.label}
                  <span className="text-xs text-muted-foreground ml-2">(Optional - leave blank to keep current value)</span>
                </Label>

                {fieldConfig.type === 'textarea' ? (
                  <Textarea
                    id={fieldConfig.key}
                    placeholder={fieldConfig.placeholder}
                    value={editFields[fieldConfig.key] || ''}
                    onChange={(e) => setEditFields(prev => ({ ...prev, [fieldConfig.key]: e.target.value }))}
                    rows={4}
                    className="font-mono text-sm"
                    disabled={saving}
                  />
                ) : (
                  <Input
                    id={fieldConfig.key}
                    type={fieldConfig.type}
                    placeholder={fieldConfig.placeholder}
                    value={editFields[fieldConfig.key] || ''}
                    onChange={(e) => setEditFields(prev => ({ ...prev, [fieldConfig.key]: e.target.value }))}
                    disabled={saving}
                  />
                )}

                {fieldConfig.description && (
                  <p className="text-xs text-muted-foreground">
                    {fieldConfig.description}
                  </p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditName(credential.name);
                setEditFields({});
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

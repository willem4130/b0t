'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Play, Loader2, Check, X } from 'lucide-react';

interface AutomationControlProps {
  title: string;
  description: string;
  jobName: string;
  defaultInterval?: string;
  defaultPrompt?: string;
}

export function AutomationControl({
  title,
  description,
  jobName,
  defaultInterval = '*/30 * * * *',
  defaultPrompt = '',
}: AutomationControlProps) {
  const [interval, setInterval] = useState(defaultInterval);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [enabled, setEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/jobs/trigger?job=${jobName}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.error || 'Unknown error' });
      }
    } catch (error) {
      setTestResult({ success: false, message: `Failed: ${error}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-border bg-surface">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-base font-black tracking-tight">{title}</CardTitle>
            <CardDescription className="text-xs text-secondary">{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-secondary">{enabled ? 'Active' : 'Inactive'}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Schedule Interval */}
        <div className="space-y-1.5">
          <Label htmlFor={`${jobName}-interval`} className="text-xs text-secondary">
            Schedule
          </Label>
          <Input
            id={`${jobName}-interval`}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            placeholder="*/30 * * * *"
            className="h-9 bg-background border-border text-sm"
          />
          <p className="text-[11px] text-secondary/70">
            Cron: */5 (every 5 min) · 0 * (hourly) · 0 0 (daily)
          </p>
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Label htmlFor={`${jobName}-prompt`} className="text-xs text-secondary">
            System Prompt
          </Label>
          <Textarea
            id={`${jobName}-prompt`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your system prompt..."
            className="min-h-[100px] bg-background border-border text-sm resize-none"
          />
        </div>

        {/* Test Button */}
        <div className="space-y-2">
          <Button
            onClick={handleTest}
            disabled={testing}
            className="w-full h-9 text-xs"
            variant="outline"
          >
            {testing ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Testing
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Test Automation
              </>
            )}
          </Button>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
              testResult.success
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20'
            }`}>
              {testResult.success ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <span className="flex-1">{testResult.message}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

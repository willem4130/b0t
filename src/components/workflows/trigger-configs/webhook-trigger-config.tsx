'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, Send, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WebhookTriggerConfigProps {
  workflowId: string;
  initialConfig?: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  onExecute: (triggerData: Record<string, unknown>) => Promise<{ success: boolean; output?: unknown; error?: string }>;
}

export function WebhookTriggerConfig({
  workflowId,
  onConfigChange,
  onExecute,
}: WebhookTriggerConfigProps) {
  const [copied, setCopied] = useState(false);
  const [testMethod, setTestMethod] = useState('POST');
  const [testPayload, setTestPayload] = useState('{\n  "message": "Test webhook"\n}');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; output?: unknown; error?: string } | null>(null);

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/${workflowId}`;

  useEffect(() => {
    onConfigChange({
      url: webhookUrl,
      method: 'POST',
    });
  }, [webhookUrl, onConfigChange]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(testPayload);
      } catch {
        setTestResult({
          success: false,
          error: 'Invalid JSON in test payload',
        });
        setTesting(false);
        return;
      }

      const result = await onExecute({
        method: testMethod,
        payload: parsedPayload,
        headers: {
          'Content-Type': 'application/json',
        },
        timestamp: new Date().toISOString(),
      });

      setTestResult(result);
    } catch {
      setTestResult({
        success: false,
        error: 'Failed to test webhook',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Webhook URL</Label>
        <div className="flex gap-2 min-w-0">
          <Input
            value={webhookUrl}
            readOnly
            className="font-mono text-xs flex-1 min-w-0 overflow-x-auto"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={copyToClipboard}
            title="Copy URL"
            className="flex-shrink-0"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Send HTTP requests to this URL to trigger the workflow
        </p>
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
        <h4 className="text-sm font-medium">Test Webhook</h4>

        <div className="space-y-2">
          <Label htmlFor="test-method">HTTP Method</Label>
          <Select value={testMethod} onValueChange={setTestMethod}>
            <SelectTrigger id="test-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="test-payload">Request Payload (JSON)</Label>
          <Textarea
            id="test-payload"
            value={testPayload}
            onChange={(e) => setTestPayload(e.target.value)}
            placeholder='{"key": "value"}'
            className="font-mono text-xs resize-none"
            rows={6}
          />
        </div>

        <Button
          onClick={handleTest}
          disabled={testing}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Test Webhook
            </>
          )}
        </Button>

        {testResult && (
          <div
            className={`rounded-lg border p-3 ${
              testResult.success
                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950'
                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {testResult.success ? (
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <span className="text-red-600 dark:text-red-400">✕</span>
              )}
              <span className="text-sm font-medium">
                {testResult.success ? 'Test Successful' : 'Test Failed'}
              </span>
            </div>
            {testResult.error && (
              <p className="text-xs text-red-700 dark:text-red-300">{testResult.error}</p>
            )}
            {testResult.output !== undefined && (
              <pre className="mt-2 text-xs bg-black/5 dark:bg-white/5 p-2 rounded overflow-auto max-h-32">
                {typeof testResult.output === 'string'
                  ? testResult.output
                  : JSON.stringify(testResult.output, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/50 p-3 space-y-2">
        <h4 className="text-sm font-medium">Example cURL Command</h4>
        <pre className="text-xs bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
          {`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${testPayload.replace(/\n\s*/g, ' ')}'`}
        </pre>
      </div>
    </div>
  );
}

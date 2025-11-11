'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CronTriggerConfigProps {
  initialConfig?: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

const cronPresets = [
  { value: 'every-minute', label: 'Every minute', cron: '* * * * *' },
  { value: 'every-5-minutes', label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { value: 'every-15-minutes', label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { value: 'every-30-minutes', label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { value: 'hourly', label: 'Every hour', cron: '0 * * * *' },
  { value: 'every-6-hours', label: 'Every 6 hours', cron: '0 */6 * * *' },
  { value: 'daily-midnight', label: 'Daily at midnight', cron: '0 0 * * *' },
  { value: 'daily-9am', label: 'Daily at 9 AM', cron: '0 9 * * *' },
  { value: 'daily-noon', label: 'Daily at noon', cron: '0 12 * * *' },
  { value: 'daily-6pm', label: 'Daily at 6 PM', cron: '0 18 * * *' },
  { value: 'weekly-monday', label: 'Weekly on Monday at 9 AM', cron: '0 9 * * 1' },
  { value: 'weekly-friday', label: 'Weekly on Friday at 5 PM', cron: '0 17 * * 5' },
  { value: 'monthly-first', label: 'Monthly on the 1st at midnight', cron: '0 0 1 * *' },
  { value: 'monthly-15th', label: 'Monthly on the 15th at noon', cron: '0 12 15 * *' },
];

const timezones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
    { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)' },
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'Asia/Shanghai', label: 'China (CST)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Seoul', label: 'Seoul (KST)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
    { value: 'Pacific/Auckland', label: 'Auckland (NZDT/NZST)' },
  ];

// Find matching preset from initial schedule
const findPresetFromCron = (cronString: string) => {
  const preset = cronPresets.find((p) => p.cron === cronString);
  return preset ? preset.value : 'daily-9am'; // Default to daily at 9 AM if no match
};

export function CronTriggerConfig({ initialConfig, onConfigChange }: CronTriggerConfigProps) {
  const [selectedPreset, setSelectedPreset] = useState(() =>
    findPresetFromCron((initialConfig?.schedule as string) || '0 9 * * *')
  );

  const [selectedTimezone, setSelectedTimezone] = useState(
    (initialConfig?.timezone as string) || 'UTC'
  );

  useEffect(() => {
    const preset = cronPresets.find((p) => p.value === selectedPreset);
    if (preset) {
      onConfigChange({
        schedule: preset.cron,
        timezone: selectedTimezone
      });
    }
  }, [selectedPreset, selectedTimezone, onConfigChange]);

  const handlePresetChange = (value: string) => {
    setSelectedPreset(value);
  };

  const handleTimezoneChange = (value: string) => {
    setSelectedTimezone(value);
  };

  const currentPreset = cronPresets.find((p) => p.value === selectedPreset);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="cron-preset" className="text-sm font-medium">
          Schedule Frequency
        </Label>
        <Select value={selectedPreset} onValueChange={handlePresetChange}>
          <SelectTrigger id="cron-preset" className="text-sm">
            <SelectValue placeholder="Select schedule" />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Frequent
            </div>
            {cronPresets.slice(0, 5).map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-sm">
                {p.label}
              </SelectItem>
            ))}
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
              Daily
            </div>
            {cronPresets.slice(5, 10).map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-sm">
                {p.label}
              </SelectItem>
            ))}
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
              Weekly & Monthly
            </div>
            {cronPresets.slice(10).map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-sm">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone" className="text-sm font-medium">
          Timezone
        </Label>
        <Select value={selectedTimezone} onValueChange={handleTimezoneChange}>
          <SelectTrigger id="timezone" className="text-sm">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              US & Canada
            </div>
            {timezones.slice(0, 6).map((tz) => (
              <SelectItem key={tz.value} value={tz.value} className="text-sm">
                {tz.label}
              </SelectItem>
            ))}
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
              Europe
            </div>
            {timezones.slice(6, 11).map((tz) => (
              <SelectItem key={tz.value} value={tz.value} className="text-sm">
                {tz.label}
              </SelectItem>
            ))}
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
              Asia & Pacific
            </div>
            {timezones.slice(11).map((tz) => (
              <SelectItem key={tz.value} value={tz.value} className="text-sm">
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-foreground mb-1">
              Selected Schedule
            </p>
            <p className="text-sm font-semibold text-foreground">
              {currentPreset?.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {timezones.find(tz => tz.value === selectedTimezone)?.label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Cron Expression</p>
            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded border">
              {currentPreset?.cron}
            </code>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        💡 The workflow will run automatically based on this schedule and timezone. You can change it anytime from workflow settings.
      </p>
    </div>
  );
}

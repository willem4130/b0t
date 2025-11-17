'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ConnectionAlertsProps {
  missingServices: {
    twitter?: boolean;
    openai?: boolean;
    youtube?: boolean;
    instagram?: boolean;
  };
}

export function ConnectionAlerts({ missingServices }: ConnectionAlertsProps) {
  const alerts = [];

  if (missingServices.twitter) {
    alerts.push({
      title: '⚠️ Twitter Not Connected',
      description: 'Connect your Twitter account to enable automated posting and replies.',
      action: {
        label: 'Connect Twitter',
        href: '/settings#twitter',
      },
      setupGuide: 'https://github.com/yourusername/social-cat/blob/main/docs/setup/TWITTER.md',
    });
  }

  if (missingServices.openai) {
    alerts.push({
      title: '⚠️ OpenAI Not Connected',
      description: 'Add your OpenAI API key to enable AI-powered content generation.',
      action: {
        label: 'Add OpenAI Key',
        href: '/settings#openai',
      },
      setupGuide: 'https://github.com/yourusername/social-cat/blob/main/docs/setup/OPENAI.md',
    });
  }

  if (missingServices.youtube) {
    alerts.push({
      title: 'ℹ️ YouTube Not Connected',
      description: 'Connect YouTube to automatically reply to comments on your videos.',
      action: {
        label: 'Connect YouTube',
        href: '/settings#youtube',
      },
      setupGuide: 'https://github.com/yourusername/social-cat/blob/main/docs/setup/YOUTUBE.md',
    });
  }

  if (missingServices.instagram) {
    alerts.push({
      title: 'ℹ️ Instagram Not Connected',
      description: 'Connect Instagram to reply to comments and DMs automatically.',
      action: {
        label: 'Connect Instagram',
        href: '/settings#instagram',
      },
      setupGuide: 'https://github.com/yourusername/social-cat/blob/main/docs/setup/INSTAGRAM.md',
    });
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mb-6">
      {alerts.map((alert, index) => (
        <Alert key={index} variant="default" className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-sm font-bold">{alert.title}</AlertTitle>
          <AlertDescription className="text-xs text-secondary mt-1">
            {alert.description}
          </AlertDescription>
          <div className="flex gap-2 mt-3">
            <Link href={alert.action.href}>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                {alert.action.label}
              </Button>
            </Link>
            <a href={alert.setupGuide} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                <ExternalLink className="h-3 w-3" />
                Setup Guide
              </Button>
            </a>
          </div>
        </Alert>
      ))}
    </div>
  );
}

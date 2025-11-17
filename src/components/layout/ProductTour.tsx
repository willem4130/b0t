'use client';

import { useEffect } from 'react';
import { driver, type Config } from 'driver.js';

const tourConfig: Config = {
  showProgress: true,
  showButtons: ['next', 'previous', 'close'],
  progressText: '{{current}} of {{total}}',
  nextBtnText: 'Next',
  prevBtnText: 'Back',
  doneBtnText: 'Done',

  // Spotlight configuration - adds padding around highlighted element
  stagePadding: 8,
  stageRadius: 8,

  // Custom styling to match your dark theme
  popoverClass: 'product-tour-popover',

  steps: [
    {
      element: '.dashboard-stats',
      popover: {
        title: 'Your Automation Dashboard',
        description: 'Track successful runs, failures, and active workflows at a glance.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[href="/dashboard/workflows"]',
      popover: {
        title: 'Workflows',
        description: 'Create and manage your AI-powered automations. Describe what you want in natural language, and AI generates the workflow for you.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[href="/dashboard/clients"]',
      popover: {
        title: 'Clients',
        description: 'Manage multiple organizations or clients. Each client has isolated workflows, credentials, and activity logs.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[href="/dashboard/credentials"]',
      popover: {
        title: 'Credentials',
        description: 'Store API keys and credentials securely. Your workflows use these to connect to external services.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[href="/dashboard/activity"]',
      popover: {
        title: 'Activity',
        description: 'View detailed execution history and debug your automations. See what worked, what failed, and why.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      popover: {
        title: 'Ready to Start?',
        description: 'Use the /workflow command in Claude Code and create your first automation!',
      },
    },
  ],
  onDestroyed: () => {
    // Mark tour as completed in localStorage
    localStorage.setItem('productTourCompleted', 'true');
  },
};

export function ProductTour({ shouldStart = false }: { shouldStart?: boolean }) {
  useEffect(() => {
    if (!shouldStart) return;

    const driverObj = driver(tourConfig);
    driverObj.drive();
  }, [shouldStart]);

  return null;
}

// Export a function to manually start the tour (useful for development)
export function startProductTour() {
  const driverObj = driver(tourConfig);
  driverObj.drive();
}

// Make it available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as Window & { startTour?: () => void }).startTour = startProductTour;
}

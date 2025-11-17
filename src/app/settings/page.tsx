'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="page-title text-gray-1000">Settings</h1>
        <p className="page-description text-gray-700 mt-1">
          Configure your account settings
        </p>
      </div>
    </DashboardLayout>
  );
}

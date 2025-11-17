import { NextResponse } from 'next/server';
import { scheduler } from '@/lib/scheduler';

/**
 * API Route to manage the scheduler
 *
 * GET /api/scheduler - Get scheduler status
 */

export async function GET() {
  const isRunning = scheduler.isRunning();
  const jobs = scheduler.getJobs();

  return NextResponse.json({
    isRunning,
    jobCount: jobs.length,
    jobs,
    message: isRunning
      ? 'Scheduler is running'
      : 'Scheduler is not running. Jobs need to be initialized in instrumentation.ts',
  });
}

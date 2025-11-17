import { NextResponse } from 'next/server';
import { getSystemStatus } from '@/lib/system-status';

export const dynamic = 'force-dynamic';

/**
 * GET /api/system/status
 * Get current system warming status
 *
 * Returns the real-time status of the workflow execution engine,
 * including module loading progress and credential cache state.
 */
export async function GET() {
  try {
    const status = getSystemStatus();

    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      {
        status: 'cold',
        modulesLoaded: 0,
        totalModules: 0,
        credentialsCached: 0,
        startupTime: Date.now(),
        lastCheck: Date.now(),
      },
      { status: 200 } // Return 200 even on error with fallback data
    );
  }
}

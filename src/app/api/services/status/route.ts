import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * API Route: Check which services are configured
 *
 * GET /api/services/status
 *
 * Returns a simple object indicating which services have credentials configured.
 * This is used to show helpful alerts in the dashboard for missing services.
 */
export async function GET() {
  // Check authentication
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check which services have required environment variables
  const status = {
    twitter: !!(
      process.env.TWITTER_API_KEY &&
      process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
    ),
    openai: !!process.env.OPENAI_API_KEY,
    youtube: !!(
      process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET
    ),
    instagram: !!process.env.INSTAGRAM_ACCESS_TOKEN,
  };

  return NextResponse.json(status);
}

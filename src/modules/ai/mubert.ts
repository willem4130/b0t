import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Mubert AI Music Module
 *
 * Royalty-free AI music generation for content creators.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (50 requests/min)
 * - Structured logging
 * - 60s timeout for operations
 *
 * Use cases:
 * - Background music for videos
 * - Podcast intros/outros
 * - Streaming background music
 * - Custom mood-based tracks
 */

if (!process.env.MUBERT_API_KEY) {
  logger.warn('⚠️  MUBERT_API_KEY is not set. Mubert features will not work.');
}

const MUBERT_API_URL = 'https://api-b2b.mubert.com/v2';

// Rate limiter: 50 requests per minute
const mubertRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 1200,
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000,
  id: 'mubert-api',
});

interface MubertTrack {
  trackId: string;
  audioUrl?: string;
  duration?: number;
  tags?: string[];
  status?: 'processing' | 'ready' | 'failed';
}

/**
 * Helper function to make API requests
 */
async function mubertApiRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
  const body = {
    method,
    params: {
      ...params,
      license: process.env.MUBERT_LICENSE || 'default',
      token: process.env.MUBERT_API_KEY,
    },
  };

  const response = await fetch(MUBERT_API_URL + '/RecService', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mubert API error: ${response.status} - ${error}`);
  }

  const result = await response.json();

  // Mubert returns { success: 1, data: {...} } or { success: 0, error: "..." }
  if (!(result as { success: number }).success) {
    throw new Error(`Mubert API error: ${(result as { error: string }).error || 'Unknown error'}`);
  }

  return (result as { data: unknown }).data;
}

/**
 * Generate track based on mood/genre tags
 *
 * @param tags - Array of mood/genre tags (e.g., ['chill', 'electronic'])
 * @param duration - Track duration in seconds (default: 60)
 * @param format - Audio format (default: 'mp3')
 * @returns Track generation result
 */
async function generateTrackInternal(
  tags: string[],
  duration: number = 60,
  format: 'mp3' | 'wav' = 'mp3'
): Promise<MubertTrack> {
  logger.info({ tags, duration, format }, 'Generating track with Mubert');

  const params = {
    mode: 'track',
    tags: tags.join(','),
    duration,
    format,
  };

  const result = await mubertApiRequest('RecService/GetGeneratedTrack', params);

  logger.info({ trackId: (result as { track_id: string }).track_id }, 'Track generation started');

  return {
    trackId: (result as { track_id: string }).track_id,
    audioUrl: (result as { audio_url?: string }).audio_url,
    duration,
    tags,
    status: (result as { audio_url?: string }).audio_url ? 'ready' : 'processing',
  };
}

const generateTrackWithBreaker = createCircuitBreaker(generateTrackInternal, {
  timeout: 60000,
  name: 'mubert:generateTrack',
});

/**
 * Generate track based on mood/genre tags (protected)
 */
export const generateTrack = withRateLimit(
  (tags: string[], duration?: number, format?: 'mp3' | 'wav') =>
    generateTrackWithBreaker.fire(tags, duration, format),
  mubertRateLimiter
);

/**
 * Generate track from prompt
 *
 * @param prompt - Text description of desired music
 * @param duration - Track duration in seconds (default: 60)
 * @param format - Audio format (default: 'mp3')
 * @returns Track generation result
 */
async function generateFromPromptInternal(
  prompt: string,
  duration: number = 60,
  format: 'mp3' | 'wav' = 'mp3'
): Promise<MubertTrack> {
  logger.info({ promptLength: prompt.length, duration, format }, 'Generating track from prompt');

  const params = {
    mode: 'track',
    prompt,
    duration,
    format,
  };

  const result = await mubertApiRequest('RecService/GetGeneratedTrack', params);

  logger.info({ trackId: (result as { track_id: string }).track_id }, 'Track generation started');

  return {
    trackId: (result as { track_id: string }).track_id,
    audioUrl: (result as { audio_url?: string }).audio_url,
    duration,
    status: (result as { audio_url?: string }).audio_url ? 'ready' : 'processing',
  };
}

const generateFromPromptWithBreaker = createCircuitBreaker(generateFromPromptInternal, {
  timeout: 60000,
  name: 'mubert:generateFromPrompt',
});

/**
 * Generate track from prompt (protected)
 */
export const generateFromPrompt = withRateLimit(
  (prompt: string, duration?: number, format?: 'mp3' | 'wav') =>
    generateFromPromptWithBreaker.fire(prompt, duration, format),
  mubertRateLimiter
);

/**
 * Get track status and download URL
 *
 * @param trackId - ID of the track
 * @returns Track details with download URL
 */
async function getTrackInternal(trackId: string): Promise<MubertTrack> {
  logger.info({ trackId }, 'Getting Mubert track details');

  const params = {
    track_id: trackId,
  };

  const result = await mubertApiRequest('RecService/GetTrackById', params);

  logger.info({ hasUrl: !!(result as { audio_url?: string }).audio_url }, 'Track details retrieved');

  return {
    trackId,
    audioUrl: (result as { audio_url?: string }).audio_url,
    duration: (result as { duration?: number }).duration,
    tags: (result as { tags?: string[] }).tags,
    status: (result as { audio_url?: string }).audio_url ? 'ready' : 'processing',
  };
}

const getTrackWithBreaker = createCircuitBreaker(getTrackInternal, {
  timeout: 30000,
  name: 'mubert:getTrack',
});

/**
 * Get track status and download URL (protected)
 */
export const getTrack = withRateLimit(
  (trackId: string) => getTrackWithBreaker.fire(trackId),
  mubertRateLimiter
);

/**
 * Search for tracks by tags
 *
 * @param tags - Array of search tags
 * @param limit - Number of results (default: 10)
 * @returns Array of matching tracks
 */
async function searchTracksInternal(tags: string[], limit: number = 10): Promise<MubertTrack[]> {
  logger.info({ tags, limit }, 'Searching Mubert tracks');

  const params = {
    tags: tags.join(','),
    limit,
  };

  const result = await mubertApiRequest('RecService/SearchTracks', params);

  const tracks = ((result as { tracks?: unknown[] }).tracks || []).map((track: unknown) => ({
    trackId: (track as { track_id: string }).track_id,
    audioUrl: (track as { audio_url?: string }).audio_url,
    duration: (track as { duration?: number }).duration,
    tags: (track as { tags?: string[] }).tags,
    status: 'ready' as const,
  }));

  logger.info({ resultCount: tracks.length }, 'Tracks searched successfully');
  return tracks;
}

const searchTracksWithBreaker = createCircuitBreaker(searchTracksInternal, {
  timeout: 30000,
  name: 'mubert:searchTracks',
});

/**
 * Search for tracks by tags (protected)
 */
export const searchTracks = withRateLimit(
  (tags: string[], limit?: number) => searchTracksWithBreaker.fire(tags, limit),
  mubertRateLimiter
);

/**
 * Get available tags/genres
 *
 * @returns Array of available tags
 */
async function getTagsInternal(): Promise<{ tags: string[]; categories: Record<string, string[]> }> {
  logger.info('Getting Mubert available tags');

  const result = await mubertApiRequest('RecService/GetTags', {});

  const tags = (result as { tags?: string[] }).tags || [];
  const categories = (result as { categories?: Record<string, string[]> }).categories || {};

  logger.info({ tagCount: tags.length, categoryCount: Object.keys(categories).length }, 'Tags retrieved');

  return { tags, categories };
}

const getTagsWithBreaker = createCircuitBreaker(getTagsInternal, {
  timeout: 30000,
  name: 'mubert:getTags',
});

/**
 * Get available tags/genres (protected)
 */
export const getTags = withRateLimit(() => getTagsWithBreaker.fire(), mubertRateLimiter);

/**
 * Start streaming session
 *
 * @param tags - Array of mood/genre tags
 * @param bitrate - Audio bitrate in kbps (default: 320)
 * @returns Streaming session details
 */
async function startStreamInternal(
  tags: string[],
  bitrate: number = 320
): Promise<{ streamUrl: string; sessionId: string }> {
  logger.info({ tags, bitrate }, 'Starting Mubert stream');

  const params = {
    tags: tags.join(','),
    bitrate,
  };

  const result = await mubertApiRequest('RecService/GetStream', params);

  logger.info({ sessionId: (result as { session_id: string }).session_id }, 'Stream started');

  return {
    streamUrl: (result as { stream_url: string }).stream_url,
    sessionId: (result as { session_id: string }).session_id,
  };
}

const startStreamWithBreaker = createCircuitBreaker(startStreamInternal, {
  timeout: 30000,
  name: 'mubert:startStream',
});

/**
 * Start streaming session (protected)
 */
export const startStream = withRateLimit(
  (tags: string[], bitrate?: number) => startStreamWithBreaker.fire(tags, bitrate),
  mubertRateLimiter
);

/**
 * Stop streaming session
 *
 * @param sessionId - ID of the streaming session
 * @returns Success status
 */
async function stopStreamInternal(sessionId: string): Promise<{ success: boolean }> {
  logger.info({ sessionId }, 'Stopping Mubert stream');

  await mubertApiRequest('RecService/StopStream', { session_id: sessionId });

  logger.info('Stream stopped successfully');
  return { success: true };
}

const stopStreamWithBreaker = createCircuitBreaker(stopStreamInternal, {
  timeout: 30000,
  name: 'mubert:stopStream',
});

/**
 * Stop streaming session (protected)
 */
export const stopStream = withRateLimit(
  (sessionId: string) => stopStreamWithBreaker.fire(sessionId),
  mubertRateLimiter
);

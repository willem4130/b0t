/* eslint-disable */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { withRateLimit } from '@/lib/rate-limiter';

/**
 * Synthesia AI Video Creation Module
 *
 * Features:
 * - Create videos with AI presenters
 * - Multi-language support (120+ languages)
 * - Auto-generated captions
 * - Custom backgrounds and branding
 * - Circuit breaker protection
 * - Rate limiting (15 req/min)
 * - Structured logging
 *
 * API Reference: https://docs.synthesia.io/
 */

const SYNTHESIA_API_BASE = 'https://api.synthesia.io/v2';

// Rate limiter: 15 requests per minute
const synthesiaRateLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 4000, // 4 seconds between requests
  reservoir: 15,
  reservoirRefreshAmount: 15,
  reservoirRefreshInterval: 60 * 1000,
});

/**
 * Make authenticated request to Synthesia API
 */
async function synthesiaRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.SYNTHESIA_API_KEY;
  if (!apiKey) {
    throw new Error('SYNTHESIA_API_KEY environment variable is not set');
  }

  const url = `${SYNTHESIA_API_BASE}${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making Synthesia API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Synthesia API request failed');
    throw new Error(`Synthesia API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Create video with AI presenter
 * @param options - Video creation options
 * @returns Video creation job details
 */
async function createVideoInternal(options: {
  script: string;
  avatarId?: string; // Avatar ID (default: use first available)
  voiceId?: string; // Voice ID
  title: string;
  background?: string; // Background color or image URL
  enableCaptions?: boolean; // Auto-generate captions
  captionLanguage?: string; // Language code (e.g., 'en-US')
}): Promise<{
  id: string;
  status: string;
  videoUrl?: string;
}> {
  logger.info(
    { scriptLength: options.script.length, title: options.title },
    'Creating Synthesia video'
  );

  const result = await synthesiaRequest<{
    id: string;
    status: string;
    download?: string;
  }>('/videos', {
    method: 'POST',
    body: JSON.stringify({
      title: options.title,
      input: [
        {
          scriptText: options.script,
          avatar: options.avatarId || 'anna_costume1_cameraA',
          voice: options.voiceId,
          background: options.background || '#FFFFFF',
        },
      ],
      captions: options.enableCaptions ? true : false,
      captionsLanguage: options.captionLanguage || 'en-US',
    }),
  });

  logger.info({ id: result.id, status: result.status }, 'Synthesia video creation started');

  return {
    id: result.id,
    status: result.status,
    videoUrl: result.download,
  };
}

const createVideoWithBreaker = createCircuitBreaker(createVideoInternal, {
  timeout: 30000,
  name: 'synthesia:createVideo',
});

export const createVideo = withRateLimit(
  (options: Parameters<typeof createVideoInternal>[0]) =>
    createVideoWithBreaker.fire(options),
  synthesiaRateLimiter
);

/**
 * Create multi-scene video
 * @param options - Multi-scene video options
 * @returns Video creation job details
 */
async function createMultiSceneVideoInternal(options: {
  title: string;
  scenes: Array<{
    script: string;
    avatarId?: string;
    voiceId?: string;
    background?: string;
  }>;
  enableCaptions?: boolean;
}): Promise<{
  id: string;
  status: string;
  videoUrl?: string;
}> {
  logger.info({ sceneCount: options.scenes.length, title: options.title }, 'Creating multi-scene video');

  const result = await synthesiaRequest<{
    id: string;
    status: string;
    download?: string;
  }>('/videos', {
    method: 'POST',
    body: JSON.stringify({
      title: options.title,
      input: options.scenes.map((scene) => ({
        scriptText: scene.script,
        avatar: scene.avatarId || 'anna_costume1_cameraA',
        voice: scene.voiceId,
        background: scene.background || '#FFFFFF',
      })),
      captions: options.enableCaptions || false,
    }),
  });

  logger.info({ id: result.id, status: result.status }, 'Multi-scene video creation started');

  return {
    id: result.id,
    status: result.status,
    videoUrl: result.download,
  };
}

const createMultiSceneVideoWithBreaker = createCircuitBreaker(createMultiSceneVideoInternal, {
  timeout: 30000,
  name: 'synthesia:createMultiSceneVideo',
});

export const createMultiSceneVideo = withRateLimit(
  (options: Parameters<typeof createMultiSceneVideoInternal>[0]) =>
    createMultiSceneVideoWithBreaker.fire(options),
  synthesiaRateLimiter
);

/**
 * Get video status
 * @param videoId - Video ID to check
 * @returns Video status and download URL
 */
async function getVideoStatusInternal(videoId: string): Promise<{
  id: string;
  status: string; // 'in_progress', 'complete', 'failed'
  videoUrl?: string;
  duration?: number; // Video duration in seconds
  error?: string;
}> {
  logger.info({ videoId }, 'Checking Synthesia video status');

  const result = await synthesiaRequest<{
    id: string;
    status: string;
    download?: string;
    duration?: number;
    error?: string;
  }>(`/videos/${videoId}`, {
    method: 'GET',
  });

  logger.info({ id: result.id, status: result.status }, 'Video status retrieved');

  return {
    id: result.id,
    status: result.status,
    videoUrl: result.download,
    duration: result.duration,
    error: result.error,
  };
}

const getVideoStatusWithBreaker = createCircuitBreaker(getVideoStatusInternal, {
  timeout: 10000,
  name: 'synthesia:getVideoStatus',
});

export const getVideoStatus = withRateLimit(
  (videoId: string) => getVideoStatusWithBreaker.fire(videoId),
  synthesiaRateLimiter
);

/**
 * List available avatars
 * @returns List of avatars
 */
async function listAvatarsInternal(): Promise<{
  avatars: Array<{
    id: string;
    name: string;
    gender: string;
    preview_image: string;
  }>;
}> {
  logger.info('Listing available avatars');

  const result = await synthesiaRequest<{
    avatars: Array<{
      id: string;
      name: string;
      gender: string;
      preview_image: string;
    }>;
  }>('/avatars', {
    method: 'GET',
  });

  logger.info({ count: result.avatars.length }, 'Avatars retrieved');

  return {
    avatars: result.avatars,
  };
}

const listAvatarsWithBreaker = createCircuitBreaker(listAvatarsInternal, {
  timeout: 10000,
  name: 'synthesia:listAvatars',
});

export const listAvatars = withRateLimit(
  () => listAvatarsWithBreaker.fire(),
  synthesiaRateLimiter
);

/**
 * List available voices
 * @param options - Filter options
 * @returns List of voices
 */
async function listVoicesInternal(options?: {
  language?: string; // Filter by language code
}): Promise<{
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender: string;
  }>;
}> {
  logger.info({ options }, 'Listing available voices');

  const params = new URLSearchParams();
  if (options?.language) params.append('language', options.language);

  const result = await synthesiaRequest<{
    voices: Array<{
      id: string;
      name: string;
      language: string;
      gender: string;
    }>;
  }>(`/voices?${params.toString()}`, {
    method: 'GET',
  });

  logger.info({ count: result.voices.length }, 'Voices retrieved');

  return {
    voices: result.voices,
  };
}

const listVoicesWithBreaker = createCircuitBreaker(listVoicesInternal, {
  timeout: 10000,
  name: 'synthesia:listVoices',
});

export const listVoices = withRateLimit(
  (options?: Parameters<typeof listVoicesInternal>[0]) =>
    listVoicesWithBreaker.fire(options),
  synthesiaRateLimiter
);

/**
 * Delete video
 * @param videoId - Video ID to delete
 * @returns Deletion confirmation
 */
async function deleteVideoInternal(videoId: string): Promise<{
  success: boolean;
  message: string;
}> {
  logger.info({ videoId }, 'Deleting video');

  await synthesiaRequest(`/videos/${videoId}`, {
    method: 'DELETE',
  });

  logger.info({ videoId }, 'Video deleted');

  return {
    success: true,
    message: 'Video deleted successfully',
  };
}

const deleteVideoWithBreaker = createCircuitBreaker(deleteVideoInternal, {
  timeout: 10000,
  name: 'synthesia:deleteVideo',
});

export const deleteVideo = withRateLimit(
  (videoId: string) => deleteVideoWithBreaker.fire(videoId),
  synthesiaRateLimiter
);

/**
 * List user videos
 * @param options - Listing options
 * @returns List of videos
 */
async function listVideosInternal(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  videos: Array<{
    id: string;
    title: string;
    status: string;
    videoUrl?: string;
    createdAt: string;
  }>;
}> {
  logger.info({ options }, 'Listing videos');

  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());

  const result = await synthesiaRequest<{
    videos: Array<{
      id: string;
      title: string;
      status: string;
      download?: string;
      createdAt: string;
    }>;
  }>(`/videos?${params.toString()}`, {
    method: 'GET',
  });

  logger.info({ count: result.videos.length }, 'Videos retrieved');

  return {
    videos: result.videos.map((video) => ({
      id: video.id,
      title: video.title,
      status: video.status,
      videoUrl: video.download,
      createdAt: video.createdAt,
    })),
  };
}

const listVideosWithBreaker = createCircuitBreaker(listVideosInternal, {
  timeout: 10000,
  name: 'synthesia:listVideos',
});

export const listVideos = withRateLimit(
  (options?: Parameters<typeof listVideosInternal>[0]) =>
    listVideosWithBreaker.fire(options),
  synthesiaRateLimiter
);

/**
 * Get account quota information
 * @returns Quota details
 */
async function getQuotaInternal(): Promise<{
  videoCreditsUsed: number;
  videoCreditsTotal: number;
  videoCreditsRemaining: number;
}> {
  logger.info('Fetching account quota');

  const result = await synthesiaRequest<{
    video_credits_used: number;
    video_credits_total: number;
  }>('/quota', {
    method: 'GET',
  });

  logger.info(
    { used: result.video_credits_used, total: result.video_credits_total },
    'Quota retrieved'
  );

  return {
    videoCreditsUsed: result.video_credits_used,
    videoCreditsTotal: result.video_credits_total,
    videoCreditsRemaining: result.video_credits_total - result.video_credits_used,
  };
}

const getQuotaWithBreaker = createCircuitBreaker(getQuotaInternal, {
  timeout: 10000,
  name: 'synthesia:getQuota',
});

export const getQuota = withRateLimit(
  () => getQuotaWithBreaker.fire(),
  synthesiaRateLimiter
);

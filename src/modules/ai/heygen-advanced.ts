import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * HeyGen Advanced Avatar Module
 *
 * AI avatar video generation with advanced features.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (50 requests/min)
 * - Structured logging
 * - 120s timeout for video operations
 *
 * Use cases:
 * - Custom avatar creation
 * - AI spokesperson videos
 * - Video localization
 * - Interactive avatars
 */

if (!process.env.HEYGEN_API_KEY) {
  logger.warn('⚠️  HEYGEN_API_KEY is not set. HeyGen features will not work.');
}

const HEYGEN_API_URL = 'https://api.heygen.com/v2';

// Rate limiter: 50 requests per minute
const heygenRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 1200,
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000,
  id: 'heygen-api',
});

interface HeyGenVideo {
  videoId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
}

interface HeyGenAvatar {
  avatarId: string;
  avatarName: string;
  previewImageUrl?: string;
}

/**
 * Helper function to make API requests
 */
async function heygenApiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const headers: Record<string, string> = {
    'X-Api-Key': process.env.HEYGEN_API_KEY || '',
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${HEYGEN_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HeyGen API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Create custom avatar from video
 *
 * @param videoUrl - URL of the training video
 * @param avatarName - Name for the avatar
 * @returns Avatar creation task
 */
async function createCustomAvatarInternal(
  videoUrl: string,
  avatarName: string
): Promise<HeyGenAvatar> {
  logger.info({ videoUrl, avatarName }, 'Creating custom HeyGen avatar');

  const body = {
    videoUrl,
    avatarName,
  };

  const result = await heygenApiRequest('/avatars', 'POST', body);

  logger.info({ avatarId: (result as HeyGenAvatar).avatarId }, 'Custom avatar creation started');
  return result as HeyGenAvatar;
}

const createCustomAvatarWithBreaker = createCircuitBreaker(createCustomAvatarInternal, {
  timeout: 120000,
  name: 'heygen:createCustomAvatar',
});

/**
 * Create custom avatar from video (protected)
 */
export const createCustomAvatar = withRateLimit(
  (videoUrl: string, avatarName: string) => createCustomAvatarWithBreaker.fire(videoUrl, avatarName),
  heygenRateLimiter
);

/**
 * Generate video with avatar
 *
 * @param avatarId - ID of the avatar to use
 * @param script - Text script for the avatar to speak
 * @param voice - Voice ID to use
 * @param background - Optional background settings
 * @returns Video generation task
 */
async function generateVideoInternal(
  avatarId: string,
  script: string,
  voice?: string,
  background?: { type: 'color' | 'image' | 'video'; value: string }
): Promise<HeyGenVideo> {
  logger.info(
    { avatarId, scriptLength: script.length, voice, hasBackground: !!background },
    'Generating HeyGen video'
  );

  const body: {
    test?: boolean;
    caption?: boolean;
    title: string;
    video_inputs: Array<{
      character: {
        type: string;
        avatar_id: string;
        avatar_style?: string;
      };
      voice: {
        type: string;
        voice_id?: string;
        input_text: string;
      };
      background?: {
        type: string;
        url?: string;
        value?: string;
      };
    }>;
  } = {
    test: false,
    caption: false,
    title: 'Generated Video',
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
        },
        voice: {
          type: 'text',
          input_text: script,
        },
      },
    ],
  };

  if (voice) {
    body.video_inputs[0].voice.voice_id = voice;
  }

  if (background) {
    body.video_inputs[0].background = {
      type: background.type,
      ...(background.type === 'color' ? { value: background.value } : { url: background.value }),
    };
  }

  const result = await heygenApiRequest('/video/generate', 'POST', body);

  logger.info({ videoId: (result as { data: HeyGenVideo }).data.videoId }, 'Video generation started');
  return (result as { data: HeyGenVideo }).data;
}

const generateVideoWithBreaker = createCircuitBreaker(generateVideoInternal, {
  timeout: 120000,
  name: 'heygen:generateVideo',
});

/**
 * Generate video with avatar (protected)
 */
export const generateVideo = withRateLimit(
  (
    avatarId: string,
    script: string,
    voice?: string,
    background?: { type: 'color' | 'image' | 'video'; value: string }
  ) => generateVideoWithBreaker.fire(avatarId, script, voice, background),
  heygenRateLimiter
);

/**
 * Get video status
 *
 * @param videoId - ID of the video
 * @returns Video status and URL if completed
 */
async function getVideoStatusInternal(videoId: string): Promise<HeyGenVideo> {
  logger.info({ videoId }, 'Getting HeyGen video status');

  const result = await heygenApiRequest(`/video/status?video_id=${videoId}`);

  logger.info({ status: (result as { data: HeyGenVideo }).data.status }, 'Video status retrieved');
  return (result as { data: HeyGenVideo }).data;
}

const getVideoStatusWithBreaker = createCircuitBreaker(getVideoStatusInternal, {
  timeout: 30000,
  name: 'heygen:getVideoStatus',
});

/**
 * Get video status (protected)
 */
export const getVideoStatus = withRateLimit(
  (videoId: string) => getVideoStatusWithBreaker.fire(videoId),
  heygenRateLimiter
);

/**
 * List available avatars
 *
 * @returns Array of available avatars
 */
async function listAvatarsInternal(): Promise<{ avatars: HeyGenAvatar[] }> {
  logger.info('Listing HeyGen avatars');

  const result = await heygenApiRequest('/avatars');

  logger.info({ count: ((result as { data: { avatars: unknown[] } }).data.avatars || []).length }, 'Avatars listed');
  return { avatars: (result as { data: { avatars: HeyGenAvatar[] } }).data.avatars };
}

const listAvatarsWithBreaker = createCircuitBreaker(listAvatarsInternal, {
  timeout: 30000,
  name: 'heygen:listAvatars',
});

/**
 * List available avatars (protected)
 */
export const listAvatars = withRateLimit(() => listAvatarsWithBreaker.fire(), heygenRateLimiter);

/**
 * List available voices
 *
 * @returns Array of available voices
 */
async function listVoicesInternal(): Promise<{
  voices: Array<{ voiceId: string; name: string; language: string; gender: string }>;
}> {
  logger.info('Listing HeyGen voices');

  const result = await heygenApiRequest('/voices');

  logger.info({ count: ((result as { data: { voices: unknown[] } }).data.voices || []).length }, 'Voices listed');
  return {
    voices: (result as { data: { voices: Array<{ voiceId: string; name: string; language: string; gender: string }> } })
      .data.voices,
  };
}

const listVoicesWithBreaker = createCircuitBreaker(listVoicesInternal, {
  timeout: 30000,
  name: 'heygen:listVoices',
});

/**
 * List available voices (protected)
 */
export const listVoices = withRateLimit(() => listVoicesWithBreaker.fire(), heygenRateLimiter);

/**
 * Add background to video
 *
 * @param videoId - ID of the video
 * @param background - Background settings
 * @returns Updated video task
 */
async function addBackgroundInternal(
  videoId: string,
  background: { type: 'color' | 'image' | 'video'; value: string }
): Promise<HeyGenVideo> {
  logger.info({ videoId, background }, 'Adding background to HeyGen video');

  const body = {
    videoId,
    background: {
      type: background.type,
      ...(background.type === 'color' ? { value: background.value } : { url: background.value }),
    },
  };

  const result = await heygenApiRequest('/video/background', 'POST', body);

  logger.info({ videoId }, 'Background added to video');
  return (result as { data: HeyGenVideo }).data;
}

const addBackgroundWithBreaker = createCircuitBreaker(addBackgroundInternal, {
  timeout: 120000,
  name: 'heygen:addBackground',
});

/**
 * Add background to video (protected)
 */
export const addBackground = withRateLimit(
  (videoId: string, background: { type: 'color' | 'image' | 'video'; value: string }) =>
    addBackgroundWithBreaker.fire(videoId, background),
  heygenRateLimiter
);

/**
 * Translate video to another language
 *
 * @param videoId - ID of the video
 * @param targetLanguage - Target language code (e.g., 'es', 'fr', 'de')
 * @param voiceId - Optional voice ID for the translation
 * @returns Translation task
 */
async function translateVideoInternal(
  videoId: string,
  targetLanguage: string,
  voiceId?: string
): Promise<HeyGenVideo> {
  logger.info({ videoId, targetLanguage, voiceId }, 'Translating HeyGen video');

  const body = {
    videoId,
    targetLanguage,
    ...(voiceId && { voiceId }),
  };

  const result = await heygenApiRequest('/video/translate', 'POST', body);

  logger.info({ translatedVideoId: (result as { data: HeyGenVideo }).data.videoId }, 'Video translation started');
  return (result as { data: HeyGenVideo }).data;
}

const translateVideoWithBreaker = createCircuitBreaker(translateVideoInternal, {
  timeout: 120000,
  name: 'heygen:translateVideo',
});

/**
 * Translate video to another language (protected)
 */
export const translateVideo = withRateLimit(
  (videoId: string, targetLanguage: string, voiceId?: string) =>
    translateVideoWithBreaker.fire(videoId, targetLanguage, voiceId),
  heygenRateLimiter
);

/**
 * List all videos
 *
 * @param limit - Number of videos to return (default: 20)
 * @param offset - Pagination offset (default: 0)
 * @returns Array of videos
 */
async function listVideosInternal(
  limit: number = 20,
  offset: number = 0
): Promise<{ videos: HeyGenVideo[]; total: number }> {
  logger.info({ limit, offset }, 'Listing HeyGen videos');

  const result = await heygenApiRequest(`/videos?limit=${limit}&offset=${offset}`);

  logger.info({ count: ((result as { data: { videos: unknown[] } }).data.videos || []).length }, 'Videos listed');
  return {
    videos: (result as { data: { videos: HeyGenVideo[] } }).data.videos,
    total: (result as { data: { total: number } }).data.total,
  };
}

const listVideosWithBreaker = createCircuitBreaker(listVideosInternal, {
  timeout: 30000,
  name: 'heygen:listVideos',
});

/**
 * List all videos (protected)
 */
export const listVideos = withRateLimit(
  (limit?: number, offset?: number) => listVideosWithBreaker.fire(limit, offset),
  heygenRateLimiter
);

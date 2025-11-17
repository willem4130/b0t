/* eslint-disable */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { withRateLimit } from '@/lib/rate-limiter';

/**
 * HeyGen AI Avatar Video Module
 *
 * Features:
 * - Create AI avatar videos from text
 * - Customize avatar appearance and voice
 * - Multi-language support
 * - Circuit breaker protection
 * - Rate limiting (20 req/min)
 * - Structured logging
 *
 * API Reference: https://docs.heygen.com/
 */

const HEYGEN_API_BASE = 'https://api.heygen.com/v2';

// Rate limiter: 20 requests per minute
const heygenRateLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 3000, // 3 seconds between requests
  reservoir: 20,
  reservoirRefreshAmount: 20,
  reservoirRefreshInterval: 60 * 1000,
});

/**
 * Make authenticated request to HeyGen API
 */
async function heygenRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error('HEYGEN_API_KEY environment variable is not set');
  }

  const url = `${HEYGEN_API_BASE}${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making HeyGen API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'HeyGen API request failed');
    throw new Error(`HeyGen API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Create avatar video from text
 * @param options - Video creation options
 * @returns Video creation job details
 */
async function createAvatarVideoInternal(options: {
  text: string;
  avatarId?: string; // Avatar ID (default: use first available)
  voiceId?: string; // Voice ID (default: use avatar's default voice)
  background?: string; // Background color or image URL
  aspectRatio?: '16:9' | '9:16' | '1:1';
  title?: string; // Video title
}): Promise<{
  videoId: string;
  status: string;
  videoUrl?: string;
}> {
  logger.info(
    { textLength: options.text.length, avatarId: options.avatarId },
    'Creating avatar video'
  );

  const result = await heygenRequest<{
    data: {
      video_id: string;
      status: string;
      video_url?: string;
    };
  }>('/video/generate', {
    method: 'POST',
    body: JSON.stringify({
      title: options.title || 'Generated Video',
      text: options.text,
      avatar_id: options.avatarId,
      voice_id: options.voiceId,
      background: options.background || '#FFFFFF',
      aspect_ratio: options.aspectRatio || '16:9',
    }),
  });

  logger.info({ videoId: result.data.video_id, status: result.data.status }, 'Avatar video creation started');

  return {
    videoId: result.data.video_id,
    status: result.data.status,
    videoUrl: result.data.video_url,
  };
}

const createAvatarVideoWithBreaker = createCircuitBreaker(createAvatarVideoInternal, {
  timeout: 30000,
  name: 'heygen:createAvatarVideo',
});

export const createAvatarVideo = withRateLimit(
  (options: Parameters<typeof createAvatarVideoInternal>[0]) =>
    createAvatarVideoWithBreaker.fire(options),
  heygenRateLimiter
);

/**
 * Create video with custom avatar
 * @param options - Custom avatar video options
 * @returns Video creation job details
 */
async function createCustomAvatarVideoInternal(options: {
  text: string;
  avatarPhotoUrl: string; // Photo to create custom avatar from
  voiceId?: string;
  background?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}): Promise<{
  videoId: string;
  status: string;
  videoUrl?: string;
}> {
  logger.info({ avatarPhotoUrl: options.avatarPhotoUrl }, 'Creating custom avatar video');

  const result = await heygenRequest<{
    data: {
      video_id: string;
      status: string;
      video_url?: string;
    };
  }>('/video/generate', {
    method: 'POST',
    body: JSON.stringify({
      text: options.text,
      avatar_photo_url: options.avatarPhotoUrl,
      voice_id: options.voiceId,
      background: options.background || '#FFFFFF',
      aspect_ratio: options.aspectRatio || '16:9',
    }),
  });

  logger.info({ videoId: result.data.video_id, status: result.data.status }, 'Custom avatar video creation started');

  return {
    videoId: result.data.video_id,
    status: result.data.status,
    videoUrl: result.data.video_url,
  };
}

const createCustomAvatarVideoWithBreaker = createCircuitBreaker(createCustomAvatarVideoInternal, {
  timeout: 30000,
  name: 'heygen:createCustomAvatarVideo',
});

export const createCustomAvatarVideo = withRateLimit(
  (options: Parameters<typeof createCustomAvatarVideoInternal>[0]) =>
    createCustomAvatarVideoWithBreaker.fire(options),
  heygenRateLimiter
);

/**
 * Get video status
 * @param videoId - Video ID to check
 * @returns Video status and URL
 */
async function getVideoStatusInternal(videoId: string): Promise<{
  videoId: string;
  status: string; // 'pending', 'processing', 'completed', 'failed'
  videoUrl?: string;
  progress?: number; // 0-100
  error?: string;
}> {
  logger.info({ videoId }, 'Checking video status');

  const result = await heygenRequest<{
    data: {
      video_id: string;
      status: string;
      video_url?: string;
      progress?: number;
      error?: string;
    };
  }>(`/video/${videoId}`, {
    method: 'GET',
  });

  logger.info(
    { videoId: result.data.video_id, status: result.data.status },
    'Video status retrieved'
  );

  return {
    videoId: result.data.video_id,
    status: result.data.status,
    videoUrl: result.data.video_url,
    progress: result.data.progress,
    error: result.data.error,
  };
}

const getVideoStatusWithBreaker = createCircuitBreaker(getVideoStatusInternal, {
  timeout: 10000,
  name: 'heygen:getVideoStatus',
});

export const getVideoStatus = withRateLimit(
  (videoId: string) => getVideoStatusWithBreaker.fire(videoId),
  heygenRateLimiter
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
    preview_image_url: string;
    preview_video_url?: string;
  }>;
}> {
  logger.info('Listing available avatars');

  const result = await heygenRequest<{
    data: {
      avatars: Array<{
        avatar_id: string;
        avatar_name: string;
        gender: string;
        preview_image_url: string;
        preview_video_url?: string;
      }>;
    };
  }>('/avatars', {
    method: 'GET',
  });

  logger.info({ count: result.data.avatars.length }, 'Avatars retrieved');

  return {
    avatars: result.data.avatars.map((avatar) => ({
      id: avatar.avatar_id,
      name: avatar.avatar_name,
      gender: avatar.gender,
      preview_image_url: avatar.preview_image_url,
      preview_video_url: avatar.preview_video_url,
    })),
  };
}

const listAvatarsWithBreaker = createCircuitBreaker(listAvatarsInternal, {
  timeout: 10000,
  name: 'heygen:listAvatars',
});

export const listAvatars = withRateLimit(
  () => listAvatarsWithBreaker.fire(),
  heygenRateLimiter
);

/**
 * List available voices
 * @param options - Filter options
 * @returns List of voices
 */
async function listVoicesInternal(options?: {
  language?: string; // Filter by language code (e.g., 'en-US', 'es-ES')
  gender?: 'male' | 'female';
}): Promise<{
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender: string;
    preview_audio_url?: string;
  }>;
}> {
  logger.info({ options }, 'Listing available voices');

  const params = new URLSearchParams();
  if (options?.language) params.append('language', options.language);
  if (options?.gender) params.append('gender', options.gender);

  const result = await heygenRequest<{
    data: {
      voices: Array<{
        voice_id: string;
        voice_name: string;
        language: string;
        gender: string;
        preview_audio_url?: string;
      }>;
    };
  }>(`/voices?${params.toString()}`, {
    method: 'GET',
  });

  logger.info({ count: result.data.voices.length }, 'Voices retrieved');

  return {
    voices: result.data.voices.map((voice) => ({
      id: voice.voice_id,
      name: voice.voice_name,
      language: voice.language,
      gender: voice.gender,
      preview_audio_url: voice.preview_audio_url,
    })),
  };
}

const listVoicesWithBreaker = createCircuitBreaker(listVoicesInternal, {
  timeout: 10000,
  name: 'heygen:listVoices',
});

export const listVoices = withRateLimit(
  (options?: Parameters<typeof listVoicesInternal>[0]) =>
    listVoicesWithBreaker.fire(options),
  heygenRateLimiter
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

  const result = await heygenRequest<{
    success: boolean;
    message: string;
  }>(`/video/${videoId}`, {
    method: 'DELETE',
  });

  logger.info({ videoId, success: result.success }, 'Video deleted');

  return result;
}

const deleteVideoWithBreaker = createCircuitBreaker(deleteVideoInternal, {
  timeout: 10000,
  name: 'heygen:deleteVideo',
});

export const deleteVideo = withRateLimit(
  (videoId: string) => deleteVideoWithBreaker.fire(videoId),
  heygenRateLimiter
);

/**
 * List user videos
 * @param options - Listing options
 * @returns List of videos
 */
async function listVideosInternal(options?: {
  limit?: number;
  offset?: number;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}): Promise<{
  videos: Array<{
    videoId: string;
    title: string;
    status: string;
    videoUrl?: string;
    createdAt: string;
  }>;
  total: number;
}> {
  logger.info({ options }, 'Listing videos');

  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  if (options?.status) params.append('status', options.status);

  const result = await heygenRequest<{
    data: {
      videos: Array<{
        video_id: string;
        title: string;
        status: string;
        video_url?: string;
        created_at: string;
      }>;
      total: number;
    };
  }>(`/videos?${params.toString()}`, {
    method: 'GET',
  });

  logger.info({ count: result.data.videos.length, total: result.data.total }, 'Videos retrieved');

  return {
    videos: result.data.videos.map((video) => ({
      videoId: video.video_id,
      title: video.title,
      status: video.status,
      videoUrl: video.video_url,
      createdAt: video.created_at,
    })),
    total: result.data.total,
  };
}

const listVideosWithBreaker = createCircuitBreaker(listVideosInternal, {
  timeout: 10000,
  name: 'heygen:listVideos',
});

export const listVideos = withRateLimit(
  (options?: Parameters<typeof listVideosInternal>[0]) =>
    listVideosWithBreaker.fire(options),
  heygenRateLimiter
);

/* eslint-disable */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { withRateLimit } from '@/lib/rate-limiter';

/**
 * Vimeo Video Hosting Module
 *
 * Features:
 * - Upload videos to Vimeo
 * - Get video information
 * - Update video settings
 * - Manage video privacy
 * - Get embed code
 * - Circuit breaker protection
 * - Rate limiting (60 req/min)
 * - Structured logging
 *
 * API Reference: https://developer.vimeo.com/api/reference
 */

const VIMEO_API_BASE = 'https://api.vimeo.com';

// Rate limiter: 60 requests per minute
const vimeoRateLimiter = new Bottleneck({
  maxConcurrent: 3,
  minTime: 1000, // 1 second between requests
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000,
});

/**
 * Make authenticated request to Vimeo API
 */
async function vimeoRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = process.env.VIMEO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('VIMEO_ACCESS_TOKEN environment variable is not set');
  }

  const url = `${VIMEO_API_BASE}${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making Vimeo API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.vimeo.*+json;version=3.4',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Vimeo API request failed');
    throw new Error(`Vimeo API error: ${response.status} - ${error}`);
  }

  // Return empty object for 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

/**
 * Upload video to Vimeo
 * @param options - Upload options
 * @returns Upload result with video URI
 */
async function uploadVideoInternal(options: {
  filePath: string; // Local file path or URL
  name: string;
  description?: string;
  privacy?: 'anybody' | 'nobody' | 'disable' | 'unlisted' | 'password';
  password?: string; // Required if privacy is 'password'
}): Promise<{
  uri: string;
  videoId: string;
  name: string;
  link: string;
  embedHtml: string;
}> {
  logger.info({ name: options.name, privacy: options.privacy }, 'Uploading video to Vimeo');

  // Create video entry
  const createResult = await vimeoRequest<{
    uri: string;
    name: string;
    link: string;
    upload: {
      upload_link: string;
    };
    embed: {
      html: string;
    };
  }>('/me/videos', {
    method: 'POST',
    body: JSON.stringify({
      upload: {
        approach: 'pull',
        link: options.filePath,
      },
      name: options.name,
      description: options.description,
      privacy: {
        view: options.privacy || 'anybody',
        ...(options.password && { password: options.password }),
      },
    }),
  });

  const videoId = createResult.uri.split('/').pop() || '';

  logger.info({ uri: createResult.uri, videoId, link: createResult.link }, 'Video uploaded to Vimeo');

  return {
    uri: createResult.uri,
    videoId,
    name: createResult.name,
    link: createResult.link,
    embedHtml: createResult.embed.html,
  };
}

const uploadVideoWithBreaker = createCircuitBreaker(uploadVideoInternal, {
  timeout: 300000, // 5 minutes for uploads
  name: 'vimeo:uploadVideo',
});

export const uploadVideo = withRateLimit(
  (options: Parameters<typeof uploadVideoInternal>[0]) =>
    uploadVideoWithBreaker.fire(options),
  vimeoRateLimiter
);

/**
 * Get video information
 * @param videoId - Vimeo video ID
 * @returns Video details
 */
async function getVideoInfoInternal(videoId: string): Promise<{
  uri: string;
  name: string;
  description?: string;
  link: string;
  duration: number;
  width: number;
  height: number;
  createdTime: string;
  modifiedTime: string;
  privacy: {
    view: string;
    embed: string;
  };
  stats: {
    plays: number;
  };
  pictures: {
    sizes: Array<{
      width: number;
      height: number;
      link: string;
    }>;
  };
  embedHtml: string;
}> {
  logger.info({ videoId }, 'Getting Vimeo video info');

  const result = await vimeoRequest<{
    uri: string;
    name: string;
    description?: string;
    link: string;
    duration: number;
    width: number;
    height: number;
    created_time: string;
    modified_time: string;
    privacy: {
      view: string;
      embed: string;
    };
    stats: {
      plays: number;
    };
    pictures: {
      sizes: Array<{
        width: number;
        height: number;
        link: string;
      }>;
    };
    embed: {
      html: string;
    };
  }>(`/videos/${videoId}`, {
    method: 'GET',
  });

  logger.info({ videoId, name: result.name, duration: result.duration }, 'Video info retrieved');

  return {
    uri: result.uri,
    name: result.name,
    description: result.description,
    link: result.link,
    duration: result.duration,
    width: result.width,
    height: result.height,
    createdTime: result.created_time,
    modifiedTime: result.modified_time,
    privacy: result.privacy,
    stats: result.stats,
    pictures: result.pictures,
    embedHtml: result.embed.html,
  };
}

const getVideoInfoWithBreaker = createCircuitBreaker(getVideoInfoInternal, {
  timeout: 10000,
  name: 'vimeo:getVideoInfo',
});

export const getVideoInfo = withRateLimit(
  (videoId: string) => getVideoInfoWithBreaker.fire(videoId),
  vimeoRateLimiter
);

/**
 * Update video settings
 * @param options - Update options
 * @returns Updated video info
 */
async function updateVideoInternal(options: {
  videoId: string;
  name?: string;
  description?: string;
  privacy?: 'anybody' | 'nobody' | 'disable' | 'unlisted' | 'password';
  password?: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  logger.info({ videoId: options.videoId }, 'Updating Vimeo video');

  await vimeoRequest(`/videos/${options.videoId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: options.name,
      description: options.description,
      privacy: options.privacy ? {
        view: options.privacy,
        ...(options.password && { password: options.password }),
      } : undefined,
    }),
  });

  logger.info({ videoId: options.videoId }, 'Video updated successfully');

  return {
    success: true,
    message: 'Video updated successfully',
  };
}

const updateVideoWithBreaker = createCircuitBreaker(updateVideoInternal, {
  timeout: 10000,
  name: 'vimeo:updateVideo',
});

export const updateVideo = withRateLimit(
  (options: Parameters<typeof updateVideoInternal>[0]) =>
    updateVideoWithBreaker.fire(options),
  vimeoRateLimiter
);

/**
 * Delete video from Vimeo
 * @param videoId - Video ID to delete
 * @returns Deletion confirmation
 */
async function deleteVideoInternal(videoId: string): Promise<{
  success: boolean;
  message: string;
}> {
  logger.info({ videoId }, 'Deleting Vimeo video');

  await vimeoRequest(`/videos/${videoId}`, {
    method: 'DELETE',
  });

  logger.info({ videoId }, 'Video deleted successfully');

  return {
    success: true,
    message: 'Video deleted successfully',
  };
}

const deleteVideoWithBreaker = createCircuitBreaker(deleteVideoInternal, {
  timeout: 10000,
  name: 'vimeo:deleteVideo',
});

export const deleteVideo = withRateLimit(
  (videoId: string) => deleteVideoWithBreaker.fire(videoId),
  vimeoRateLimiter
);

/**
 * List user videos
 * @param options - List options
 * @returns List of videos
 */
async function listVideosInternal(options?: {
  perPage?: number;
  page?: number;
  sort?: 'date' | 'alphabetical' | 'plays' | 'likes' | 'comments' | 'duration';
  direction?: 'asc' | 'desc';
}): Promise<{
  total: number;
  page: number;
  perPage: number;
  videos: Array<{
    uri: string;
    videoId: string;
    name: string;
    link: string;
    duration: number;
    createdTime: string;
  }>;
}> {
  logger.info({ options }, 'Listing Vimeo videos');

  const params = new URLSearchParams();
  if (options?.perPage) params.append('per_page', options.perPage.toString());
  if (options?.page) params.append('page', options.page.toString());
  if (options?.sort) params.append('sort', options.sort);
  if (options?.direction) params.append('direction', options.direction);

  const result = await vimeoRequest<{
    total: number;
    page: number;
    per_page: number;
    data: Array<{
      uri: string;
      name: string;
      link: string;
      duration: number;
      created_time: string;
    }>;
  }>(`/me/videos?${params.toString()}`, {
    method: 'GET',
  });

  logger.info({ total: result.total, count: result.data.length }, 'Videos retrieved');

  return {
    total: result.total,
    page: result.page,
    perPage: result.per_page,
    videos: result.data.map((video) => ({
      uri: video.uri,
      videoId: video.uri.split('/').pop() || '',
      name: video.name,
      link: video.link,
      duration: video.duration,
      createdTime: video.created_time,
    })),
  };
}

const listVideosWithBreaker = createCircuitBreaker(listVideosInternal, {
  timeout: 10000,
  name: 'vimeo:listVideos',
});

export const listVideos = withRateLimit(
  (options?: Parameters<typeof listVideosInternal>[0]) =>
    listVideosWithBreaker.fire(options),
  vimeoRateLimiter
);

/**
 * Get video embed code
 * @param options - Embed options
 * @returns Embed HTML code
 */
async function getEmbedCodeInternal(options: {
  videoId: string;
  width?: number;
  height?: number;
  responsive?: boolean;
}): Promise<{
  embedHtml: string;
  playerUrl: string;
}> {
  logger.info({ videoId: options.videoId }, 'Getting embed code');

  const info = await getVideoInfoInternal(options.videoId);

  let embedHtml = info.embedHtml;

  // Customize embed dimensions if specified
  if (options.width || options.height) {
    embedHtml = embedHtml
      .replace(/width="\d+"/, `width="${options.width || 640}"`)
      .replace(/height="\d+"/, `height="${options.height || 360}"`);
  }

  if (options.responsive) {
    embedHtml = `<div style="padding:56.25% 0 0 0;position:relative;">${embedHtml}</div>`;
  }

  const playerUrl = `https://player.vimeo.com/video/${options.videoId}`;

  logger.info({ videoId: options.videoId, playerUrl }, 'Embed code generated');

  return {
    embedHtml,
    playerUrl,
  };
}

const getEmbedCodeWithBreaker = createCircuitBreaker(getEmbedCodeInternal, {
  timeout: 10000,
  name: 'vimeo:getEmbedCode',
});

export const getEmbedCode = withRateLimit(
  (options: Parameters<typeof getEmbedCodeInternal>[0]) =>
    getEmbedCodeWithBreaker.fire(options),
  vimeoRateLimiter
);

/**
 * Get video thumbnail
 * @param options - Thumbnail options
 * @returns Thumbnail URL
 */
async function getThumbnailInternal(options: {
  videoId: string;
  width?: number;
  height?: number;
}): Promise<{
  url: string;
  width: number;
  height: number;
}> {
  logger.info({ videoId: options.videoId }, 'Getting video thumbnail');

  const info = await getVideoInfoInternal(options.videoId);

  // Find best matching thumbnail size
  let bestMatch = info.pictures.sizes[0];

  if (options.width || options.height) {
    const targetWidth = options.width || 640;
    const targetHeight = options.height || 360;

    bestMatch = info.pictures.sizes.reduce((best, current) => {
      const currentDiff = Math.abs(current.width - targetWidth) + Math.abs(current.height - targetHeight);
      const bestDiff = Math.abs(best.width - targetWidth) + Math.abs(best.height - targetHeight);
      return currentDiff < bestDiff ? current : best;
    });
  }

  logger.info({ url: bestMatch.link, width: bestMatch.width, height: bestMatch.height }, 'Thumbnail retrieved');

  return {
    url: bestMatch.link,
    width: bestMatch.width,
    height: bestMatch.height,
  };
}

const getThumbnailWithBreaker = createCircuitBreaker(getThumbnailInternal, {
  timeout: 10000,
  name: 'vimeo:getThumbnail',
});

export const getThumbnail = withRateLimit(
  (options: Parameters<typeof getThumbnailInternal>[0]) =>
    getThumbnailWithBreaker.fire(options),
  vimeoRateLimiter
);

/**
 * Get video stats
 * @param videoId - Video ID
 * @returns Video statistics
 */
async function getVideoStatsInternal(videoId: string): Promise<{
  plays: number;
  likes: number;
  comments: number;
  downloads: number;
}> {
  logger.info({ videoId }, 'Getting video stats');

  const result = await vimeoRequest<{
    stats: {
      plays: number;
    };
    metadata: {
      connections: {
        likes: { total: number };
        comments: { total: number };
      };
    };
  }>(`/videos/${videoId}`, {
    method: 'GET',
  });

  logger.info({ videoId, plays: result.stats.plays }, 'Video stats retrieved');

  return {
    plays: result.stats.plays || 0,
    likes: result.metadata.connections.likes.total || 0,
    comments: result.metadata.connections.comments.total || 0,
    downloads: 0, // Downloads info may require additional API call
  };
}

const getVideoStatsWithBreaker = createCircuitBreaker(getVideoStatsInternal, {
  timeout: 10000,
  name: 'vimeo:getVideoStats',
});

export const getVideoStats = withRateLimit(
  (videoId: string) => getVideoStatsWithBreaker.fire(videoId),
  vimeoRateLimiter
);

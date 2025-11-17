/* eslint-disable */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { withRateLimit } from '@/lib/rate-limiter';

/**
 * TikTok API Module
 *
 * Features:
 * - Upload videos to TikTok
 * - Get video information
 * - Get user videos
 * - Get video comments
 * - Circuit breaker protection
 * - Rate limiting (50 req/min)
 * - Structured logging
 *
 * API Reference: https://developers.tiktok.com/doc/
 */

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

// Rate limiter: 50 requests per minute
const tiktokRateLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 1200, // 1.2 seconds between requests
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000,
});

/**
 * Make authenticated request to TikTok API
 */
async function tiktokRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('TIKTOK_ACCESS_TOKEN environment variable is not set');
  }

  const url = `${TIKTOK_API_BASE}${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making TikTok API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'TikTok API request failed');
    throw new Error(`TikTok API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Initialize video upload
 * @param options - Upload initialization options
 * @returns Upload URL and video ID
 */
async function initializeUploadInternal(options: {
  videoSize: number; // Video size in bytes
  chunkSize?: number; // Chunk size for upload
  totalChunks?: number; // Total number of chunks
}): Promise<{
  uploadUrl: string;
  publishId: string;
}> {
  logger.info({ videoSize: options.videoSize }, 'Initializing TikTok video upload');

  const result = await tiktokRequest<{
    data: {
      upload_url: string;
      publish_id: string;
    };
  }>('/post/publish/video/init/', {
    method: 'POST',
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: options.videoSize,
        chunk_size: options.chunkSize || options.videoSize,
        total_chunk_count: options.totalChunks || 1,
      },
    }),
  });

  logger.info({ publishId: result.data.publish_id }, 'Upload initialized');

  return {
    uploadUrl: result.data.upload_url,
    publishId: result.data.publish_id,
  };
}

const initializeUploadWithBreaker = createCircuitBreaker(initializeUploadInternal, {
  timeout: 30000,
  name: 'tiktok:initializeUpload',
});

export const initializeUpload = withRateLimit(
  (options: Parameters<typeof initializeUploadInternal>[0]) =>
    initializeUploadWithBreaker.fire(options),
  tiktokRateLimiter
);

/**
 * Upload video to TikTok
 * @param options - Upload options
 * @returns Video upload result
 */
async function uploadVideoInternal(options: {
  videoFile: Blob | File;
  title: string;
  description?: string;
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}): Promise<{
  publishId: string;
  status: string;
}> {
  logger.info({ title: options.title, videoSize: options.videoFile.size }, 'Uploading video to TikTok');

  // Initialize upload
  const { uploadUrl, publishId } = await initializeUploadInternal({
    videoSize: options.videoFile.size,
  });

  // Upload video file
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: options.videoFile,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': options.videoFile.size.toString(),
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload video: ${uploadResponse.statusText}`);
  }

  // Publish video
  const result = await tiktokRequest<{
    data: {
      publish_id: string;
      status: string;
    };
  }>('/post/publish/status/fetch/', {
    method: 'POST',
    body: JSON.stringify({
      publish_id: publishId,
    }),
  });

  logger.info({ publishId, status: result.data.status }, 'Video upload completed');

  return {
    publishId: result.data.publish_id,
    status: result.data.status,
  };
}

const uploadVideoWithBreaker = createCircuitBreaker(uploadVideoInternal, {
  timeout: 300000, // 5 minutes for upload
  name: 'tiktok:uploadVideo',
});

export const uploadVideo = withRateLimit(
  (options: Parameters<typeof uploadVideoInternal>[0]) =>
    uploadVideoWithBreaker.fire(options),
  tiktokRateLimiter
);

/**
 * Get video information
 * @param videoId - TikTok video ID
 * @returns Video details
 */
async function getVideoInfoInternal(videoId: string): Promise<{
  id: string;
  createTime: number;
  coverImageUrl: string;
  shareUrl: string;
  videoDescription: string;
  duration: number;
  height: number;
  width: number;
  title: string;
  embedHtml: string;
  embedLink: string;
}> {
  logger.info({ videoId }, 'Getting TikTok video info');

  const result = await tiktokRequest<{
    data: {
      videos: Array<{
        id: string;
        create_time: number;
        cover_image_url: string;
        share_url: string;
        video_description: string;
        duration: number;
        height: number;
        width: number;
        title: string;
        embed_html: string;
        embed_link: string;
      }>;
    };
  }>('/video/query/', {
    method: 'POST',
    body: JSON.stringify({
      filters: {
        video_ids: [videoId],
      },
    }),
  });

  if (!result.data.videos || result.data.videos.length === 0) {
    throw new Error(`Video not found: ${videoId}`);
  }

  const video = result.data.videos[0];

  logger.info({ videoId, title: video.title }, 'Video info retrieved');

  return {
    id: video.id,
    createTime: video.create_time,
    coverImageUrl: video.cover_image_url,
    shareUrl: video.share_url,
    videoDescription: video.video_description,
    duration: video.duration,
    height: video.height,
    width: video.width,
    title: video.title,
    embedHtml: video.embed_html,
    embedLink: video.embed_link,
  };
}

const getVideoInfoWithBreaker = createCircuitBreaker(getVideoInfoInternal, {
  timeout: 10000,
  name: 'tiktok:getVideoInfo',
});

export const getVideoInfo = withRateLimit(
  (videoId: string) => getVideoInfoWithBreaker.fire(videoId),
  tiktokRateLimiter
);

/**
 * Get user videos
 * @param options - Query options
 * @returns List of user videos
 */
async function getUserVideosInternal(options?: {
  maxCount?: number;
  cursor?: string;
}): Promise<{
  videos: Array<{
    id: string;
    title: string;
    coverImageUrl: string;
    shareUrl: string;
    createTime: number;
    duration: number;
  }>;
  cursor?: string;
  hasMore: boolean;
}> {
  logger.info({ options }, 'Getting user videos');

  const result = await tiktokRequest<{
    data: {
      videos: Array<{
        id: string;
        title: string;
        cover_image_url: string;
        share_url: string;
        create_time: number;
        duration: number;
      }>;
      cursor?: string;
      has_more: boolean;
    };
  }>('/video/list/', {
    method: 'POST',
    body: JSON.stringify({
      max_count: options?.maxCount || 20,
      cursor: options?.cursor,
    }),
  });

  logger.info({ count: result.data.videos.length, hasMore: result.data.has_more }, 'User videos retrieved');

  return {
    videos: result.data.videos.map((video) => ({
      id: video.id,
      title: video.title,
      coverImageUrl: video.cover_image_url,
      shareUrl: video.share_url,
      createTime: video.create_time,
      duration: video.duration,
    })),
    cursor: result.data.cursor,
    hasMore: result.data.has_more,
  };
}

const getUserVideosWithBreaker = createCircuitBreaker(getUserVideosInternal, {
  timeout: 10000,
  name: 'tiktok:getUserVideos',
});

export const getUserVideos = withRateLimit(
  (options?: Parameters<typeof getUserVideosInternal>[0]) =>
    getUserVideosWithBreaker.fire(options),
  tiktokRateLimiter
);

/**
 * Get video comments
 * @param options - Comment query options
 * @returns List of comments
 */
async function getVideoCommentsInternal(options: {
  videoId: string;
  maxCount?: number;
  cursor?: string;
}): Promise<{
  comments: Array<{
    id: string;
    text: string;
    createTime: number;
    likeCount: number;
    replyCount: number;
    userId: string;
  }>;
  cursor?: string;
  hasMore: boolean;
}> {
  logger.info({ videoId: options.videoId }, 'Getting video comments');

  const result = await tiktokRequest<{
    data: {
      comments: Array<{
        id: string;
        text: string;
        create_time: number;
        like_count: number;
        reply_count: number;
        user_id: string;
      }>;
      cursor?: string;
      has_more: boolean;
    };
  }>('/video/comment/list/', {
    method: 'POST',
    body: JSON.stringify({
      video_id: options.videoId,
      max_count: options.maxCount || 20,
      cursor: options.cursor,
    }),
  });

  logger.info({ count: result.data.comments.length }, 'Comments retrieved');

  return {
    comments: result.data.comments.map((comment) => ({
      id: comment.id,
      text: comment.text,
      createTime: comment.create_time,
      likeCount: comment.like_count,
      replyCount: comment.reply_count,
      userId: comment.user_id,
    })),
    cursor: result.data.cursor,
    hasMore: result.data.has_more,
  };
}

const getVideoCommentsWithBreaker = createCircuitBreaker(getVideoCommentsInternal, {
  timeout: 10000,
  name: 'tiktok:getVideoComments',
});

export const getVideoComments = withRateLimit(
  (options: Parameters<typeof getVideoCommentsInternal>[0]) =>
    getVideoCommentsWithBreaker.fire(options),
  tiktokRateLimiter
);

/**
 * Get user info
 * @returns User information
 */
async function getUserInfoInternal(): Promise<{
  openId: string;
  unionId: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
  videoCount: number;
}> {
  logger.info('Getting TikTok user info');

  const result = await tiktokRequest<{
    data: {
      user: {
        open_id: string;
        union_id: string;
        display_name: string;
        avatar_url: string;
        follower_count: number;
        following_count: number;
        video_count: number;
      };
    };
  }>('/user/info/', {
    method: 'GET',
  });

  logger.info({ displayName: result.data.user.display_name }, 'User info retrieved');

  return {
    openId: result.data.user.open_id,
    unionId: result.data.user.union_id,
    displayName: result.data.user.display_name,
    avatarUrl: result.data.user.avatar_url,
    followerCount: result.data.user.follower_count,
    followingCount: result.data.user.following_count,
    videoCount: result.data.user.video_count,
  };
}

const getUserInfoWithBreaker = createCircuitBreaker(getUserInfoInternal, {
  timeout: 10000,
  name: 'tiktok:getUserInfo',
});

export const getUserInfo = withRateLimit(
  () => getUserInfoWithBreaker.fire(),
  tiktokRateLimiter
);

/**
 * Delete video
 * @param videoId - Video ID to delete
 * @returns Deletion result
 */
async function deleteVideoInternal(videoId: string): Promise<{
  success: boolean;
  message: string;
}> {
  logger.info({ videoId }, 'Deleting TikTok video');

  await tiktokRequest('/post/publish/video/delete/', {
    method: 'POST',
    body: JSON.stringify({
      video_id: videoId,
    }),
  });

  logger.info({ videoId }, 'Video deleted successfully');

  return {
    success: true,
    message: 'Video deleted successfully',
  };
}

const deleteVideoWithBreaker = createCircuitBreaker(deleteVideoInternal, {
  timeout: 10000,
  name: 'tiktok:deleteVideo',
});

export const deleteVideo = withRateLimit(
  (videoId: string) => deleteVideoWithBreaker.fire(videoId),
  tiktokRateLimiter
);

/**
 * Get video analytics
 * @param options - Analytics query options
 * @returns Video analytics data
 */
async function getVideoAnalyticsInternal(options: {
  videoIds: string[];
  fields: string[]; // e.g., ['like_count', 'comment_count', 'share_count', 'view_count']
}): Promise<{
  videos: Array<{
    id: string;
    metrics: Record<string, number>;
  }>;
}> {
  logger.info({ videoCount: options.videoIds.length }, 'Getting video analytics');

  const result = await tiktokRequest<{
    data: {
      videos: Array<{
        id: string;
        metrics: Record<string, number>;
      }>;
    };
  }>('/video/query/', {
    method: 'POST',
    body: JSON.stringify({
      filters: {
        video_ids: options.videoIds,
      },
      fields: options.fields,
    }),
  });

  logger.info({ count: result.data.videos.length }, 'Analytics retrieved');

  return {
    videos: result.data.videos,
  };
}

const getVideoAnalyticsWithBreaker = createCircuitBreaker(getVideoAnalyticsInternal, {
  timeout: 10000,
  name: 'tiktok:getVideoAnalytics',
});

export const getVideoAnalytics = withRateLimit(
  (options: Parameters<typeof getVideoAnalyticsInternal>[0]) =>
    getVideoAnalyticsWithBreaker.fire(options),
  tiktokRateLimiter
);

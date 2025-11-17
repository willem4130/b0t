/* eslint-disable */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { withRateLimit } from '@/lib/rate-limiter';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary Video Processing Module
 *
 * Features:
 * - Upload videos to cloud storage
 * - Resize, crop, and transform videos
 * - Convert video formats
 * - Generate thumbnails
 * - Apply effects and overlays
 * - Circuit breaker protection
 * - Rate limiting (100 req/min)
 * - Structured logging
 *
 * API Reference: https://cloudinary.com/documentation/video_manipulation_and_delivery
 */

// Rate limiter: 100 requests per minute
const cloudinaryRateLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 600, // 600ms between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000,
});

/**
 * Configure Cloudinary
 */
function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/**
 * Upload video to Cloudinary
 * @param options - Upload options
 * @returns Upload result with video URL
 */
async function uploadVideoInternal(options: {
  videoPath: string; // Local file path or URL
  folder?: string; // Folder to upload to
  publicId?: string; // Custom public ID
  tags?: string[]; // Tags for organization
  context?: Record<string, string>; // Custom metadata
}): Promise<{
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  duration: number;
  width: number;
  height: number;
  bytes: number;
}> {
  configureCloudinary();

  logger.info({ videoPath: options.videoPath, folder: options.folder }, 'Uploading video to Cloudinary');

  const result = await cloudinary.uploader.upload(options.videoPath, {
    resource_type: 'video',
    folder: options.folder,
    public_id: options.publicId,
    tags: options.tags,
    context: options.context,
  });

  logger.info({ publicId: result.public_id, url: result.secure_url }, 'Video uploaded successfully');

  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    format: result.format,
    duration: result.duration || 0,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  };
}

const uploadVideoWithBreaker = createCircuitBreaker(uploadVideoInternal, {
  timeout: 300000, // 5 minutes for large uploads
  name: 'cloudinary:uploadVideo',
});

export const uploadVideo = withRateLimit(
  (options: Parameters<typeof uploadVideoInternal>[0]) =>
    uploadVideoWithBreaker.fire(options),
  cloudinaryRateLimiter
);

/**
 * Transform video (resize, crop, etc.)
 * @param options - Transformation options
 * @returns Transformed video URL
 */
async function transformVideoInternal(options: {
  publicId: string;
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'scale' | 'crop' | 'thumb';
  quality?: 'auto' | number; // Quality (1-100 or 'auto')
  format?: 'mp4' | 'webm' | 'ogv' | 'flv';
  effect?: string; // Effects like 'accelerate', 'reverse', 'boomerang'
  startOffset?: number; // Start time in seconds
  endOffset?: number; // End time in seconds
  duration?: number; // Duration in seconds
}): Promise<{
  url: string;
  transformation: string;
}> {
  configureCloudinary();

  logger.info({ publicId: options.publicId }, 'Transforming video');

  const transformation: Record<string, any> = {};

  if (options.width) transformation.width = options.width;
  if (options.height) transformation.height = options.height;
  if (options.crop) transformation.crop = options.crop;
  if (options.quality) transformation.quality = options.quality;
  if (options.format) transformation.fetch_format = options.format;
  if (options.effect) transformation.effect = options.effect;
  if (options.startOffset !== undefined) transformation.start_offset = options.startOffset;
  if (options.endOffset !== undefined) transformation.end_offset = options.endOffset;
  if (options.duration !== undefined) transformation.duration = options.duration;

  const url = cloudinary.url(options.publicId, {
    resource_type: 'video',
    transformation,
  });

  logger.info({ url, publicId: options.publicId }, 'Video transformation URL generated');

  return {
    url,
    transformation: JSON.stringify(transformation),
  };
}

const transformVideoWithBreaker = createCircuitBreaker(transformVideoInternal, {
  timeout: 10000,
  name: 'cloudinary:transformVideo',
});

export const transformVideo = withRateLimit(
  (options: Parameters<typeof transformVideoInternal>[0]) =>
    transformVideoWithBreaker.fire(options),
  cloudinaryRateLimiter
);

/**
 * Generate video thumbnail
 * @param options - Thumbnail options
 * @returns Thumbnail URL
 */
async function generateThumbnailInternal(options: {
  publicId: string;
  width?: number;
  height?: number;
  time?: number; // Time in seconds to capture thumbnail
  format?: 'jpg' | 'png' | 'webp';
}): Promise<{
  url: string;
  width?: number;
  height?: number;
}> {
  configureCloudinary();

  logger.info({ publicId: options.publicId, time: options.time }, 'Generating video thumbnail');

  const transformation: Record<string, any> = {
    start_offset: options.time || 0,
  };

  if (options.width) transformation.width = options.width;
  if (options.height) transformation.height = options.height;
  if (options.format) transformation.fetch_format = options.format;

  const url = cloudinary.url(options.publicId, {
    resource_type: 'video',
    transformation,
    format: options.format || 'jpg',
  });

  logger.info({ url, publicId: options.publicId }, 'Thumbnail URL generated');

  return {
    url,
    width: options.width,
    height: options.height,
  };
}

const generateThumbnailWithBreaker = createCircuitBreaker(generateThumbnailInternal, {
  timeout: 10000,
  name: 'cloudinary:generateThumbnail',
});

export const generateThumbnail = withRateLimit(
  (options: Parameters<typeof generateThumbnailInternal>[0]) =>
    generateThumbnailWithBreaker.fire(options),
  cloudinaryRateLimiter
);

/**
 * Convert video format
 * @param options - Conversion options
 * @returns Converted video URL
 */
async function convertFormatInternal(options: {
  publicId: string;
  format: 'mp4' | 'webm' | 'ogv' | 'flv' | 'mov' | 'avi';
  quality?: 'auto' | number;
  codec?: string; // Video codec (e.g., 'h264', 'h265', 'vp9')
}): Promise<{
  url: string;
  format: string;
}> {
  configureCloudinary();

  logger.info({ publicId: options.publicId, targetFormat: options.format }, 'Converting video format');

  const transformation: Record<string, any> = {
    fetch_format: options.format,
  };

  if (options.quality) transformation.quality = options.quality;
  if (options.codec) transformation.video_codec = options.codec;

  const url = cloudinary.url(options.publicId, {
    resource_type: 'video',
    transformation,
  });

  logger.info({ url, format: options.format }, 'Video format conversion URL generated');

  return {
    url,
    format: options.format,
  };
}

const convertFormatWithBreaker = createCircuitBreaker(convertFormatInternal, {
  timeout: 10000,
  name: 'cloudinary:convertFormat',
});

export const convertFormat = withRateLimit(
  (options: Parameters<typeof convertFormatInternal>[0]) =>
    convertFormatWithBreaker.fire(options),
  cloudinaryRateLimiter
);

/**
 * Add text overlay to video
 * @param options - Overlay options
 * @returns Video URL with overlay
 */
async function addTextOverlayInternal(options: {
  publicId: string;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  color?: string; // Hex color without #
  gravity?: 'north' | 'south' | 'east' | 'west' | 'center';
  x?: number; // X offset
  y?: number; // Y offset
}): Promise<{
  url: string;
}> {
  configureCloudinary();

  logger.info({ publicId: options.publicId, text: options.text }, 'Adding text overlay to video');

  const url = cloudinary.url(options.publicId, {
    resource_type: 'video',
    transformation: [
      {
        overlay: {
          font_family: options.fontFamily || 'Arial',
          font_size: options.fontSize || 40,
          font_weight: options.fontWeight || 'bold',
          text: options.text,
        },
        color: options.color || 'white',
        gravity: options.gravity || 'south',
        x: options.x || 0,
        y: options.y || 20,
      },
    ],
  });

  logger.info({ url }, 'Text overlay added to video');

  return { url };
}

const addTextOverlayWithBreaker = createCircuitBreaker(addTextOverlayInternal, {
  timeout: 10000,
  name: 'cloudinary:addTextOverlay',
});

export const addTextOverlay = withRateLimit(
  (options: Parameters<typeof addTextOverlayInternal>[0]) =>
    addTextOverlayWithBreaker.fire(options),
  cloudinaryRateLimiter
);

/**
 * Delete video from Cloudinary
 * @param publicId - Public ID of video to delete
 * @returns Deletion result
 */
async function deleteVideoInternal(publicId: string): Promise<{
  result: string;
  success: boolean;
}> {
  configureCloudinary();

  logger.info({ publicId }, 'Deleting video from Cloudinary');

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'video',
  });

  logger.info({ publicId, result: result.result }, 'Video deletion completed');

  return {
    result: result.result,
    success: result.result === 'ok',
  };
}

const deleteVideoWithBreaker = createCircuitBreaker(deleteVideoInternal, {
  timeout: 30000,
  name: 'cloudinary:deleteVideo',
});

export const deleteVideo = withRateLimit(
  (publicId: string) => deleteVideoWithBreaker.fire(publicId),
  cloudinaryRateLimiter
);

/**
 * Get video details
 * @param publicId - Public ID of video
 * @returns Video details
 */
async function getVideoDetailsInternal(publicId: string): Promise<{
  publicId: string;
  format: string;
  version: number;
  resourceType: string;
  type: string;
  createdAt: string;
  bytes: number;
  width: number;
  height: number;
  url: string;
  secureUrl: string;
  duration?: number;
  bitRate?: number;
  frameRate?: number;
  videoCodec?: string;
  audioCodec?: string;
}> {
  configureCloudinary();

  logger.info({ publicId }, 'Getting video details');

  const result = await cloudinary.api.resource(publicId, {
    resource_type: 'video',
  });

  logger.info({ publicId, format: result.format }, 'Video details retrieved');

  return {
    publicId: result.public_id,
    format: result.format,
    version: result.version,
    resourceType: result.resource_type,
    type: result.type,
    createdAt: result.created_at,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    url: result.url,
    secureUrl: result.secure_url,
    duration: result.duration,
    bitRate: result.bit_rate,
    frameRate: result.frame_rate,
    videoCodec: result.video?.codec,
    audioCodec: result.audio?.codec,
  };
}

const getVideoDetailsWithBreaker = createCircuitBreaker(getVideoDetailsInternal, {
  timeout: 10000,
  name: 'cloudinary:getVideoDetails',
});

export const getVideoDetails = withRateLimit(
  (publicId: string) => getVideoDetailsWithBreaker.fire(publicId),
  cloudinaryRateLimiter
);

/**
 * List videos in folder
 * @param options - List options
 * @returns List of videos
 */
async function listVideosInternal(options?: {
  folder?: string;
  maxResults?: number;
  nextCursor?: string;
}): Promise<{
  resources: Array<{
    publicId: string;
    format: string;
    bytes: number;
    url: string;
    secureUrl: string;
    createdAt: string;
  }>;
  nextCursor?: string;
}> {
  configureCloudinary();

  logger.info({ folder: options?.folder }, 'Listing videos');

  const result = await cloudinary.api.resources({
    resource_type: 'video',
    type: 'upload',
    prefix: options?.folder,
    max_results: options?.maxResults || 10,
    next_cursor: options?.nextCursor,
  });

  logger.info({ count: result.resources.length }, 'Videos retrieved');

  return {
    resources: result.resources.map((resource: any) => ({
      publicId: resource.public_id,
      format: resource.format,
      bytes: resource.bytes,
      url: resource.url,
      secureUrl: resource.secure_url,
      createdAt: resource.created_at,
    })),
    nextCursor: result.next_cursor,
  };
}

const listVideosWithBreaker = createCircuitBreaker(listVideosInternal, {
  timeout: 10000,
  name: 'cloudinary:listVideos',
});

export const listVideos = withRateLimit(
  (options?: Parameters<typeof listVideosInternal>[0]) =>
    listVideosWithBreaker.fire(options),
  cloudinaryRateLimiter
);

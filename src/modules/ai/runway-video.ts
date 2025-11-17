import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Runway ML Video Generation Module
 *
 * AI-powered video generation and editing platform.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (50 requests/min)
 * - Structured logging
 * - 120s timeout for video operations
 *
 * Use cases:
 * - Text-to-video generation
 * - Video extension
 * - Frame interpolation
 * - Video upscaling
 */

if (!process.env.RUNWAY_API_KEY) {
  logger.warn('⚠️  RUNWAY_API_KEY is not set. Runway features will not work.');
}

const RUNWAY_API_URL = 'https://api.runwayml.com/v1';

// Rate limiter: 50 requests per minute
const runwayRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 1200, // 1.2s between requests
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000,
  id: 'runway-api',
});

interface RunwayVideoGeneration {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  progress?: number;
}

/**
 * Helper function to make API requests
 */
async function runwayApiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${RUNWAY_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Runway API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Generate video from text prompt
 *
 * @param prompt - Text description of the video
 * @param duration - Video duration in seconds (default: 4)
 * @param aspectRatio - Video aspect ratio (default: '16:9')
 * @param style - Optional style preset
 * @returns Generation task ID and status
 */
async function generateVideoInternal(
  prompt: string,
  duration: number = 4,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  style?: string
): Promise<RunwayVideoGeneration> {
  logger.info({ promptLength: prompt.length, duration, aspectRatio }, 'Generating video with Runway');

  const body = {
    prompt,
    duration,
    aspectRatio,
    ...(style && { style }),
  };

  const result = await runwayApiRequest('/generations', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Video generation started');
  return result as RunwayVideoGeneration;
}

const generateVideoWithBreaker = createCircuitBreaker(generateVideoInternal, {
  timeout: 120000, // 2 minutes for video generation
  name: 'runway:generateVideo',
});

/**
 * Generate video from text prompt (protected)
 */
export const generateVideo = withRateLimit(
  (prompt: string, duration?: number, aspectRatio?: '16:9' | '9:16' | '1:1', style?: string) =>
    generateVideoWithBreaker.fire(prompt, duration, aspectRatio, style),
  runwayRateLimiter
);

/**
 * Get video generation status
 *
 * @param generationId - ID of the generation task
 * @returns Generation status and video URL if completed
 */
async function getGenerationStatusInternal(generationId: string): Promise<RunwayVideoGeneration> {
  logger.info({ generationId }, 'Getting Runway generation status');

  const result = await runwayApiRequest(`/generations/${generationId}`);

  logger.info({ status: (result as RunwayVideoGeneration).status }, 'Status retrieved');
  return result as RunwayVideoGeneration;
}

const getGenerationStatusWithBreaker = createCircuitBreaker(getGenerationStatusInternal, {
  timeout: 30000,
  name: 'runway:getGenerationStatus',
});

/**
 * Get video generation status (protected)
 */
export const getGenerationStatus = withRateLimit(
  (generationId: string) => getGenerationStatusWithBreaker.fire(generationId),
  runwayRateLimiter
);

/**
 * Extend an existing video
 *
 * @param videoUrl - URL of the video to extend
 * @param prompt - Text description for the extension
 * @param duration - Extension duration in seconds (default: 4)
 * @returns Generation task ID and status
 */
async function extendVideoInternal(
  videoUrl: string,
  prompt: string,
  duration: number = 4
): Promise<RunwayVideoGeneration> {
  logger.info({ videoUrl, promptLength: prompt.length, duration }, 'Extending video with Runway');

  const body = {
    videoUrl,
    prompt,
    duration,
  };

  const result = await runwayApiRequest('/generations/extend', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Video extension started');
  return result as RunwayVideoGeneration;
}

const extendVideoWithBreaker = createCircuitBreaker(extendVideoInternal, {
  timeout: 120000,
  name: 'runway:extendVideo',
});

/**
 * Extend an existing video (protected)
 */
export const extendVideo = withRateLimit(
  (videoUrl: string, prompt: string, duration?: number) =>
    extendVideoWithBreaker.fire(videoUrl, prompt, duration),
  runwayRateLimiter
);

/**
 * Interpolate frames between two images
 *
 * @param startImageUrl - URL of the starting image
 * @param endImageUrl - URL of the ending image
 * @param frames - Number of frames to interpolate (default: 30)
 * @returns Generation task ID and status
 */
async function interpolateFramesInternal(
  startImageUrl: string,
  endImageUrl: string,
  frames: number = 30
): Promise<RunwayVideoGeneration> {
  logger.info({ startImageUrl, endImageUrl, frames }, 'Interpolating frames with Runway');

  const body = {
    startImageUrl,
    endImageUrl,
    frames,
  };

  const result = await runwayApiRequest('/generations/interpolate', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Frame interpolation started');
  return result as RunwayVideoGeneration;
}

const interpolateFramesWithBreaker = createCircuitBreaker(interpolateFramesInternal, {
  timeout: 120000,
  name: 'runway:interpolateFrames',
});

/**
 * Interpolate frames between two images (protected)
 */
export const interpolateFrames = withRateLimit(
  (startImageUrl: string, endImageUrl: string, frames?: number) =>
    interpolateFramesWithBreaker.fire(startImageUrl, endImageUrl, frames),
  runwayRateLimiter
);

/**
 * Upscale video resolution
 *
 * @param videoUrl - URL of the video to upscale
 * @param scale - Upscaling factor (2 or 4, default: 2)
 * @returns Generation task ID and status
 */
async function upscaleVideoInternal(
  videoUrl: string,
  scale: 2 | 4 = 2
): Promise<RunwayVideoGeneration> {
  logger.info({ videoUrl, scale }, 'Upscaling video with Runway');

  const body = {
    videoUrl,
    scale,
  };

  const result = await runwayApiRequest('/generations/upscale', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Video upscaling started');
  return result as RunwayVideoGeneration;
}

const upscaleVideoWithBreaker = createCircuitBreaker(upscaleVideoInternal, {
  timeout: 120000,
  name: 'runway:upscaleVideo',
});

/**
 * Upscale video resolution (protected)
 */
export const upscaleVideo = withRateLimit(
  (videoUrl: string, scale?: 2 | 4) => upscaleVideoWithBreaker.fire(videoUrl, scale),
  runwayRateLimiter
);

/**
 * Generate video from image
 *
 * @param imageUrl - URL of the source image
 * @param prompt - Text description for the animation
 * @param duration - Video duration in seconds (default: 4)
 * @returns Generation task ID and status
 */
async function imageToVideoInternal(
  imageUrl: string,
  prompt: string,
  duration: number = 4
): Promise<RunwayVideoGeneration> {
  logger.info({ imageUrl, promptLength: prompt.length, duration }, 'Generating video from image');

  const body = {
    imageUrl,
    prompt,
    duration,
  };

  const result = await runwayApiRequest('/generations/image-to-video', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Image-to-video generation started');
  return result as RunwayVideoGeneration;
}

const imageToVideoWithBreaker = createCircuitBreaker(imageToVideoInternal, {
  timeout: 120000,
  name: 'runway:imageToVideo',
});

/**
 * Generate video from image (protected)
 */
export const imageToVideo = withRateLimit(
  (imageUrl: string, prompt: string, duration?: number) =>
    imageToVideoWithBreaker.fire(imageUrl, prompt, duration),
  runwayRateLimiter
);

/**
 * Remove background from video
 *
 * @param videoUrl - URL of the video
 * @returns Generation task ID and status
 */
async function removeBackgroundInternal(videoUrl: string): Promise<RunwayVideoGeneration> {
  logger.info({ videoUrl }, 'Removing background from video');

  const body = {
    videoUrl,
  };

  const result = await runwayApiRequest('/generations/remove-background', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Background removal started');
  return result as RunwayVideoGeneration;
}

const removeBackgroundWithBreaker = createCircuitBreaker(removeBackgroundInternal, {
  timeout: 120000,
  name: 'runway:removeBackground',
});

/**
 * Remove background from video (protected)
 */
export const removeBackground = withRateLimit(
  (videoUrl: string) => removeBackgroundWithBreaker.fire(videoUrl),
  runwayRateLimiter
);

/**
 * List all generations
 *
 * @param limit - Number of generations to return (default: 20)
 * @param offset - Pagination offset (default: 0)
 * @returns Array of generations
 */
async function listGenerationsInternal(
  limit: number = 20,
  offset: number = 0
): Promise<{ generations: RunwayVideoGeneration[]; total: number }> {
  logger.info({ limit, offset }, 'Listing Runway generations');

  const result = await runwayApiRequest(`/generations?limit=${limit}&offset=${offset}`);

  logger.info(
    { count: ((result as { generations: unknown[] }).generations || []).length },
    'Generations listed'
  );
  return result as { generations: RunwayVideoGeneration[]; total: number };
}

const listGenerationsWithBreaker = createCircuitBreaker(listGenerationsInternal, {
  timeout: 30000,
  name: 'runway:listGenerations',
});

/**
 * List all generations (protected)
 */
export const listGenerations = withRateLimit(
  (limit?: number, offset?: number) => listGenerationsWithBreaker.fire(limit, offset),
  runwayRateLimiter
);

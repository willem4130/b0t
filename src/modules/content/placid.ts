import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Placid API Client with Reliability Infrastructure
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (120 requests/hour)
 * - Structured logging
 * - Automatic error handling
 * - Image and video generation from templates
 *
 * API Documentation: https://placid.app/docs
 */

// Placid rate limiter: 120 requests per hour
const placidRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 30000, // 30 seconds between requests
  reservoir: 120,
  reservoirRefreshAmount: 120,
  reservoirRefreshInterval: 60 * 60 * 1000, // Per hour
  id: 'placid-api',
});

// Placid circuit breaker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPlacidCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return createCircuitBreaker(fn, {
    timeout: 60000, // 60 seconds (generation can be slow)
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `placid:${fn.name}`,
  });
}

export interface PlacidConfig {
  apiToken: string;
}

export interface PlacidImage {
  uuid: string;
  status: 'queued' | 'rendering' | 'finished' | 'error';
  image_url?: string;
  thumbnail_url?: string;
  template_uuid: string;
  layers: Record<string, string | number | boolean>;
  created_at: string;
  finished_at?: string;
  polling_url: string;
}

export interface PlacidTemplate {
  uuid: string;
  name: string;
  width: number;
  height: number;
  thumbnail_url: string;
  created_at: string;
  layers: Array<{
    name: string;
    type: 'text' | 'image' | 'rectangle' | 'browser';
  }>;
}

export interface PlacidVideo {
  uuid: string;
  status: 'queued' | 'rendering' | 'finished' | 'error';
  video_url?: string;
  thumbnail_url?: string;
  template_uuid: string;
  layers: Record<string, string | number | boolean>;
  created_at: string;
  finished_at?: string;
  polling_url: string;
}

/**
 * Make authenticated request to Placid API
 */
async function placidRequest(
  config: PlacidConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `https://api.placid.app${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making Placid API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Placid API error');
    throw new Error(`Placid API error (${response.status}): ${error}`);
  }

  return response;
}

/**
 * Generate image from template (internal, unprotected)
 */
async function generateImageInternal(
  config: PlacidConfig,
  templateUuid: string,
  layers: Record<string, string | number | boolean>,
  options?: {
    create_now?: boolean;
    webhook_url?: string;
  }
): Promise<PlacidImage> {
  logger.info(
    { templateUuid, layersCount: Object.keys(layers).length },
    'Generating image from Placid template'
  );

  const response = await placidRequest(config, '/api/rest/images', {
    method: 'POST',
    body: JSON.stringify({
      template_uuid: templateUuid,
      layers,
      create_now: options?.create_now ?? true,
      webhook_url: options?.webhook_url,
    }),
  });

  const data = await response.json();

  logger.info(
    { uuid: data.uuid, status: data.status, templateUuid },
    'Placid image generation started'
  );

  return data;
}

/**
 * Generate image from template (protected with circuit breaker + rate limiting)
 */
const generateImageWithBreaker = createPlacidCircuitBreaker(generateImageInternal);
export const generateImage = withRateLimit(
  (
    config: PlacidConfig,
    templateUuid: string,
    layers: Record<string, string | number | boolean>,
    options?: {
      create_now?: boolean;
      webhook_url?: string;
    }
  ) => generateImageWithBreaker.fire(config, templateUuid, layers, options),
  placidRateLimiter
);

/**
 * Get image by UUID (internal, unprotected)
 */
async function getImageInternal(
  config: PlacidConfig,
  imageUuid: string
): Promise<PlacidImage> {
  logger.info({ imageUuid }, 'Fetching Placid image');

  const response = await placidRequest(config, `/api/rest/images/${imageUuid}`);
  const data = await response.json();

  logger.info(
    { imageUuid, status: data.status },
    'Placid image fetched'
  );

  return data;
}

/**
 * Get image by UUID (protected with circuit breaker + rate limiting)
 */
const getImageWithBreaker = createPlacidCircuitBreaker(getImageInternal);
export const getImage = withRateLimit(
  (config: PlacidConfig, imageUuid: string) =>
    getImageWithBreaker.fire(config, imageUuid),
  placidRateLimiter
);

/**
 * List templates (internal, unprotected)
 */
async function listTemplatesInternal(
  config: PlacidConfig
): Promise<PlacidTemplate[]> {
  logger.info('Listing Placid templates');

  const response = await placidRequest(config, '/api/rest/templates');
  const data = await response.json();

  logger.info({ templatesCount: data.length }, 'Templates listed successfully');
  return data;
}

/**
 * List templates (protected with circuit breaker + rate limiting)
 */
const listTemplatesWithBreaker = createPlacidCircuitBreaker(listTemplatesInternal);
export const listTemplates = withRateLimit(
  (config: PlacidConfig) => listTemplatesWithBreaker.fire(config),
  placidRateLimiter
);

/**
 * Get template by UUID (internal, unprotected)
 */
async function getTemplateInternal(
  config: PlacidConfig,
  templateUuid: string
): Promise<PlacidTemplate> {
  logger.info({ templateUuid }, 'Fetching Placid template');

  const response = await placidRequest(config, `/api/rest/templates/${templateUuid}`);
  const data = await response.json();

  logger.info(
    { templateUuid, name: data.name },
    'Template fetched successfully'
  );

  return data;
}

/**
 * Get template by UUID (protected with circuit breaker + rate limiting)
 */
const getTemplateWithBreaker = createPlacidCircuitBreaker(getTemplateInternal);
export const getTemplate = withRateLimit(
  (config: PlacidConfig, templateUuid: string) =>
    getTemplateWithBreaker.fire(config, templateUuid),
  placidRateLimiter
);

/**
 * Wait for image to be ready (internal, unprotected)
 */
async function waitForImageInternal(
  config: PlacidConfig,
  imageUuid: string,
  maxAttempts = 30,
  pollInterval = 2000
): Promise<string> {
  logger.info(
    { imageUuid, maxAttempts, pollInterval },
    'Waiting for Placid image to be ready'
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const image = await getImageInternal(config, imageUuid);

    if (image.status === 'finished' && image.image_url) {
      logger.info({ imageUuid, imageUrl: image.image_url }, 'Image ready');
      return image.image_url;
    }

    if (image.status === 'error') {
      logger.error({ imageUuid }, 'Image generation failed');
      throw new Error('Image generation failed');
    }

    logger.debug(
      { imageUuid, attempt, status: image.status },
      'Image still processing'
    );

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Image generation timed out after ${maxAttempts} attempts`);
}

/**
 * Wait for image to be ready (protected with circuit breaker + rate limiting)
 */
const waitForImageWithBreaker = createPlacidCircuitBreaker(waitForImageInternal);
export const waitForImage = withRateLimit(
  (config: PlacidConfig, imageUuid: string, maxAttempts = 30, pollInterval = 2000) =>
    waitForImageWithBreaker.fire(config, imageUuid, maxAttempts, pollInterval),
  placidRateLimiter
);

/**
 * Generate video from template (internal, unprotected)
 */
async function generateVideoInternal(
  config: PlacidConfig,
  templateUuid: string,
  layers: Record<string, string | number | boolean>,
  options?: {
    create_now?: boolean;
    webhook_url?: string;
    duration?: number;
  }
): Promise<PlacidVideo> {
  logger.info(
    { templateUuid, layersCount: Object.keys(layers).length },
    'Generating video from Placid template'
  );

  const response = await placidRequest(config, '/api/rest/videos', {
    method: 'POST',
    body: JSON.stringify({
      template_uuid: templateUuid,
      layers,
      create_now: options?.create_now ?? true,
      webhook_url: options?.webhook_url,
      duration: options?.duration,
    }),
  });

  const data = await response.json();

  logger.info(
    { uuid: data.uuid, status: data.status, templateUuid },
    'Placid video generation started'
  );

  return data;
}

/**
 * Generate video from template (protected with circuit breaker + rate limiting)
 */
const generateVideoWithBreaker = createPlacidCircuitBreaker(generateVideoInternal);
export const generateVideo = withRateLimit(
  (
    config: PlacidConfig,
    templateUuid: string,
    layers: Record<string, string | number | boolean>,
    options?: {
      create_now?: boolean;
      webhook_url?: string;
      duration?: number;
    }
  ) => generateVideoWithBreaker.fire(config, templateUuid, layers, options),
  placidRateLimiter
);

/**
 * Get video by UUID (internal, unprotected)
 */
async function getVideoInternal(
  config: PlacidConfig,
  videoUuid: string
): Promise<PlacidVideo> {
  logger.info({ videoUuid }, 'Fetching Placid video');

  const response = await placidRequest(config, `/api/rest/videos/${videoUuid}`);
  const data = await response.json();

  logger.info(
    { videoUuid, status: data.status },
    'Placid video fetched'
  );

  return data;
}

/**
 * Get video by UUID (protected with circuit breaker + rate limiting)
 */
const getVideoWithBreaker = createPlacidCircuitBreaker(getVideoInternal);
export const getVideo = withRateLimit(
  (config: PlacidConfig, videoUuid: string) =>
    getVideoWithBreaker.fire(config, videoUuid),
  placidRateLimiter
);

/**
 * Wait for video to be ready (internal, unprotected)
 */
async function waitForVideoInternal(
  config: PlacidConfig,
  videoUuid: string,
  maxAttempts = 60,
  pollInterval = 5000
): Promise<string> {
  logger.info(
    { videoUuid, maxAttempts, pollInterval },
    'Waiting for Placid video to be ready'
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const video = await getVideoInternal(config, videoUuid);

    if (video.status === 'finished' && video.video_url) {
      logger.info({ videoUuid, videoUrl: video.video_url }, 'Video ready');
      return video.video_url;
    }

    if (video.status === 'error') {
      logger.error({ videoUuid }, 'Video generation failed');
      throw new Error('Video generation failed');
    }

    logger.debug(
      { videoUuid, attempt, status: video.status },
      'Video still processing'
    );

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Video generation timed out after ${maxAttempts} attempts`);
}

/**
 * Wait for video to be ready (protected with circuit breaker + rate limiting)
 */
const waitForVideoWithBreaker = createPlacidCircuitBreaker(waitForVideoInternal);
export const waitForVideo = withRateLimit(
  (config: PlacidConfig, videoUuid: string, maxAttempts = 60, pollInterval = 5000) =>
    waitForVideoWithBreaker.fire(config, videoUuid, maxAttempts, pollInterval),
  placidRateLimiter
);

/**
 * Generate and wait for image in one operation (internal, unprotected)
 */
async function generateImageAndWaitInternal(
  config: PlacidConfig,
  templateUuid: string,
  layers: Record<string, string | number | boolean>
): Promise<string> {
  logger.info(
    { templateUuid, layersCount: Object.keys(layers).length },
    'Generating and waiting for Placid image'
  );

  // Generate image
  const image = await generateImageInternal(config, templateUuid, layers);

  // Wait for it to be ready
  const imageUrl = await waitForImageInternal(config, image.uuid);

  logger.info({ imageUrl, templateUuid }, 'Image generated successfully');
  return imageUrl;
}

/**
 * Generate and wait for image in one operation (protected with circuit breaker + rate limiting)
 */
const generateImageAndWaitWithBreaker = createPlacidCircuitBreaker(
  generateImageAndWaitInternal
);
export const generateImageAndWait = withRateLimit(
  (
    config: PlacidConfig,
    templateUuid: string,
    layers: Record<string, string | number | boolean>
  ) => generateImageAndWaitWithBreaker.fire(config, templateUuid, layers),
  placidRateLimiter
);

/**
 * Generate and wait for video in one operation (internal, unprotected)
 */
async function generateVideoAndWaitInternal(
  config: PlacidConfig,
  templateUuid: string,
  layers: Record<string, string | number | boolean>,
  duration?: number
): Promise<string> {
  logger.info(
    { templateUuid, layersCount: Object.keys(layers).length, duration },
    'Generating and waiting for Placid video'
  );

  // Generate video
  const video = await generateVideoInternal(config, templateUuid, layers, { duration });

  // Wait for it to be ready
  const videoUrl = await waitForVideoInternal(config, video.uuid);

  logger.info({ videoUrl, templateUuid }, 'Video generated successfully');
  return videoUrl;
}

/**
 * Generate and wait for video in one operation (protected with circuit breaker + rate limiting)
 */
const generateVideoAndWaitWithBreaker = createPlacidCircuitBreaker(
  generateVideoAndWaitInternal
);
export const generateVideoAndWait = withRateLimit(
  (
    config: PlacidConfig,
    templateUuid: string,
    layers: Record<string, string | number | boolean>,
    duration?: number
  ) => generateVideoAndWaitWithBreaker.fire(config, templateUuid, layers, duration),
  placidRateLimiter
);

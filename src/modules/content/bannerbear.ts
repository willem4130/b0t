import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Bannerbear API Client with Reliability Infrastructure
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (120 requests/hour)
 * - Structured logging
 * - Automatic error handling
 * - Image and video generation from templates
 *
 * API Documentation: https://developers.bannerbear.com/
 */

// Bannerbear rate limiter: 120 requests per hour
const bannerbearRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 30000, // 30 seconds between requests
  reservoir: 120,
  reservoirRefreshAmount: 120,
  reservoirRefreshInterval: 60 * 60 * 1000, // Per hour
  id: 'bannerbear-api',
});

// Bannerbear circuit breaker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createBannerbearCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return createCircuitBreaker(fn, {
    timeout: 60000, // 60 seconds (image generation can be slow)
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `bannerbear:${fn.name}`,
  });
}

export interface BannerbearConfig {
  apiKey: string;
}

export interface BannerbearImage {
  uid: string;
  status: 'pending' | 'completed' | 'failed';
  image_url?: string;
  webhook_url?: string;
  created_at: string;
  template: string;
  modifications?: Array<{
    name: string;
    text?: string;
    image_url?: string;
  }>;
  metadata?: Record<string, string>;
}

export interface BannerbearTemplate {
  uid: string;
  name: string;
  width: number;
  height: number;
  preview_url: string;
  tags: string[];
}

export interface BannerbearVideo {
  uid: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  video_url?: string;
  created_at: string;
  movie: string;
  input?: Array<{
    name: string;
    value: string;
  }>;
  metadata?: Record<string, string>;
}

/**
 * Make authenticated request to Bannerbear API
 */
async function bannerbearRequest(
  config: BannerbearConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `https://api.bannerbear.com/v2${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making Bannerbear API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Bannerbear API error');
    throw new Error(`Bannerbear API error (${response.status}): ${error}`);
  }

  return response;
}

/**
 * Generate image from template (internal, unprotected)
 */
async function generateImageInternal(
  config: BannerbearConfig,
  templateUid: string,
  modifications: Array<{
    name: string;
    text?: string;
    image_url?: string;
    color?: string;
  }>,
  metadata?: Record<string, string>,
  webhookUrl?: string
): Promise<BannerbearImage> {
  logger.info(
    { templateUid, modificationsCount: modifications.length },
    'Generating image from Bannerbear template'
  );

  const response = await bannerbearRequest(config, '/images', {
    method: 'POST',
    body: JSON.stringify({
      template: templateUid,
      modifications,
      metadata,
      webhook_url: webhookUrl,
    }),
  });

  const data = await response.json();

  logger.info(
    { uid: data.uid, status: data.status, templateUid },
    'Bannerbear image generation started'
  );

  return data;
}

/**
 * Generate image from template (protected with circuit breaker + rate limiting)
 */
const generateImageWithBreaker = createBannerbearCircuitBreaker(generateImageInternal);
export const generateImage = withRateLimit(
  (
    config: BannerbearConfig,
    templateUid: string,
    modifications: Array<{
      name: string;
      text?: string;
      image_url?: string;
      color?: string;
    }>,
    metadata?: Record<string, string>,
    webhookUrl?: string
  ) => generateImageWithBreaker.fire(config, templateUid, modifications, metadata, webhookUrl),
  bannerbearRateLimiter
);

/**
 * Get image by UID (internal, unprotected)
 */
async function getImageInternal(
  config: BannerbearConfig,
  imageUid: string
): Promise<BannerbearImage> {
  logger.info({ imageUid }, 'Fetching Bannerbear image');

  const response = await bannerbearRequest(config, `/images/${imageUid}`);
  const data = await response.json();

  logger.info(
    { imageUid, status: data.status },
    'Bannerbear image fetched'
  );

  return data;
}

/**
 * Get image by UID (protected with circuit breaker + rate limiting)
 */
const getImageWithBreaker = createBannerbearCircuitBreaker(getImageInternal);
export const getImage = withRateLimit(
  (config: BannerbearConfig, imageUid: string) =>
    getImageWithBreaker.fire(config, imageUid),
  bannerbearRateLimiter
);

/**
 * List templates (internal, unprotected)
 */
async function listTemplatesInternal(
  config: BannerbearConfig,
  page = 1,
  limit = 25,
  tag?: string
): Promise<BannerbearTemplate[]> {
  logger.info({ page, limit, tag }, 'Listing Bannerbear templates');

  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (tag) params.append('tag', tag);

  const response = await bannerbearRequest(
    config,
    `/templates?${params.toString()}`
  );
  const data = await response.json();

  logger.info({ templatesCount: data.length }, 'Templates listed successfully');
  return data;
}

/**
 * List templates (protected with circuit breaker + rate limiting)
 */
const listTemplatesWithBreaker = createBannerbearCircuitBreaker(listTemplatesInternal);
export const listTemplates = withRateLimit(
  (config: BannerbearConfig, page = 1, limit = 25, tag?: string) =>
    listTemplatesWithBreaker.fire(config, page, limit, tag),
  bannerbearRateLimiter
);

/**
 * Get template by UID (internal, unprotected)
 */
async function getTemplateInternal(
  config: BannerbearConfig,
  templateUid: string
): Promise<BannerbearTemplate> {
  logger.info({ templateUid }, 'Fetching Bannerbear template');

  const response = await bannerbearRequest(config, `/templates/${templateUid}`);
  const data = await response.json();

  logger.info(
    { templateUid, name: data.name },
    'Template fetched successfully'
  );

  return data;
}

/**
 * Get template by UID (protected with circuit breaker + rate limiting)
 */
const getTemplateWithBreaker = createBannerbearCircuitBreaker(getTemplateInternal);
export const getTemplate = withRateLimit(
  (config: BannerbearConfig, templateUid: string) =>
    getTemplateWithBreaker.fire(config, templateUid),
  bannerbearRateLimiter
);

/**
 * Wait for image to be ready (internal, unprotected)
 */
async function waitForImageInternal(
  config: BannerbearConfig,
  imageUid: string,
  maxAttempts = 30,
  pollInterval = 2000
): Promise<string> {
  logger.info(
    { imageUid, maxAttempts, pollInterval },
    'Waiting for Bannerbear image to be ready'
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const image = await getImageInternal(config, imageUid);

    if (image.status === 'completed' && image.image_url) {
      logger.info({ imageUid, imageUrl: image.image_url }, 'Image ready');
      return image.image_url;
    }

    if (image.status === 'failed') {
      logger.error({ imageUid }, 'Image generation failed');
      throw new Error('Image generation failed');
    }

    logger.debug(
      { imageUid, attempt, status: image.status },
      'Image still processing'
    );

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Image generation timed out after ${maxAttempts} attempts`);
}

/**
 * Wait for image to be ready (protected with circuit breaker + rate limiting)
 */
const waitForImageWithBreaker = createBannerbearCircuitBreaker(waitForImageInternal);
export const waitForImage = withRateLimit(
  (config: BannerbearConfig, imageUid: string, maxAttempts = 30, pollInterval = 2000) =>
    waitForImageWithBreaker.fire(config, imageUid, maxAttempts, pollInterval),
  bannerbearRateLimiter
);

/**
 * Generate video from movie template (internal, unprotected)
 */
async function generateVideoInternal(
  config: BannerbearConfig,
  movieUid: string,
  input: Array<{
    name: string;
    value: string;
  }>,
  metadata?: Record<string, string>,
  webhookUrl?: string
): Promise<BannerbearVideo> {
  logger.info(
    { movieUid, inputCount: input.length },
    'Generating video from Bannerbear movie template'
  );

  const response = await bannerbearRequest(config, '/videos', {
    method: 'POST',
    body: JSON.stringify({
      movie: movieUid,
      input,
      metadata,
      webhook_url: webhookUrl,
    }),
  });

  const data = await response.json();

  logger.info(
    { uid: data.uid, status: data.status, movieUid },
    'Bannerbear video generation started'
  );

  return data;
}

/**
 * Generate video from movie template (protected with circuit breaker + rate limiting)
 */
const generateVideoWithBreaker = createBannerbearCircuitBreaker(generateVideoInternal);
export const generateVideo = withRateLimit(
  (
    config: BannerbearConfig,
    movieUid: string,
    input: Array<{
      name: string;
      value: string;
    }>,
    metadata?: Record<string, string>,
    webhookUrl?: string
  ) => generateVideoWithBreaker.fire(config, movieUid, input, metadata, webhookUrl),
  bannerbearRateLimiter
);

/**
 * Get video by UID (internal, unprotected)
 */
async function getVideoInternal(
  config: BannerbearConfig,
  videoUid: string
): Promise<BannerbearVideo> {
  logger.info({ videoUid }, 'Fetching Bannerbear video');

  const response = await bannerbearRequest(config, `/videos/${videoUid}`);
  const data = await response.json();

  logger.info(
    { videoUid, status: data.status },
    'Bannerbear video fetched'
  );

  return data;
}

/**
 * Get video by UID (protected with circuit breaker + rate limiting)
 */
const getVideoWithBreaker = createBannerbearCircuitBreaker(getVideoInternal);
export const getVideo = withRateLimit(
  (config: BannerbearConfig, videoUid: string) =>
    getVideoWithBreaker.fire(config, videoUid),
  bannerbearRateLimiter
);

/**
 * Wait for video to be ready (internal, unprotected)
 */
async function waitForVideoInternal(
  config: BannerbearConfig,
  videoUid: string,
  maxAttempts = 60,
  pollInterval = 5000
): Promise<string> {
  logger.info(
    { videoUid, maxAttempts, pollInterval },
    'Waiting for Bannerbear video to be ready'
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const video = await getVideoInternal(config, videoUid);

    if (video.status === 'completed' && video.video_url) {
      logger.info({ videoUid, videoUrl: video.video_url }, 'Video ready');
      return video.video_url;
    }

    if (video.status === 'failed') {
      logger.error({ videoUid }, 'Video generation failed');
      throw new Error('Video generation failed');
    }

    logger.debug(
      { videoUid, attempt, status: video.status },
      'Video still processing'
    );

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Video generation timed out after ${maxAttempts} attempts`);
}

/**
 * Wait for video to be ready (protected with circuit breaker + rate limiting)
 */
const waitForVideoWithBreaker = createBannerbearCircuitBreaker(waitForVideoInternal);
export const waitForVideo = withRateLimit(
  (config: BannerbearConfig, videoUid: string, maxAttempts = 60, pollInterval = 5000) =>
    waitForVideoWithBreaker.fire(config, videoUid, maxAttempts, pollInterval),
  bannerbearRateLimiter
);

/**
 * Generate and wait for image in one operation (internal, unprotected)
 */
async function generateImageAndWaitInternal(
  config: BannerbearConfig,
  templateUid: string,
  modifications: Array<{
    name: string;
    text?: string;
    image_url?: string;
    color?: string;
  }>,
  metadata?: Record<string, string>
): Promise<string> {
  logger.info(
    { templateUid, modificationsCount: modifications.length },
    'Generating and waiting for Bannerbear image'
  );

  // Generate image
  const image = await generateImageInternal(
    config,
    templateUid,
    modifications,
    metadata
  );

  // Wait for it to be ready
  const imageUrl = await waitForImageInternal(config, image.uid);

  logger.info({ imageUrl, templateUid }, 'Image generated successfully');
  return imageUrl;
}

/**
 * Generate and wait for image in one operation (protected with circuit breaker + rate limiting)
 */
const generateImageAndWaitWithBreaker = createBannerbearCircuitBreaker(
  generateImageAndWaitInternal
);
export const generateImageAndWait = withRateLimit(
  (
    config: BannerbearConfig,
    templateUid: string,
    modifications: Array<{
      name: string;
      text?: string;
      image_url?: string;
      color?: string;
    }>,
    metadata?: Record<string, string>
  ) => generateImageAndWaitWithBreaker.fire(config, templateUid, modifications, metadata),
  bannerbearRateLimiter
);

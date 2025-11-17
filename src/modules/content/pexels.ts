import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Pexels API Client with Reliability Infrastructure
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (200 requests/hour for free tier)
 * - Structured logging
 * - Automatic error handling
 * - Photo and video support
 *
 * API Documentation: https://www.pexels.com/api/documentation/
 */

// Pexels rate limiter: 200 requests per hour (free tier)
const pexelsRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 18000, // 18 seconds between requests
  reservoir: 200,
  reservoirRefreshAmount: 200,
  reservoirRefreshInterval: 60 * 60 * 1000, // Per hour
  id: 'pexels-api',
});

// Pexels circuit breaker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPexelsCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return createCircuitBreaker(fn, {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `pexels:${fn.name}`,
  });
}

export interface PexelsConfig {
  apiKey: string;
}

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
}

export interface PexelsPhotoSearchResult {
  page: number;
  per_page: number;
  total_results: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: Array<{
    id: number;
    quality: string;
    file_type: string;
    width: number;
    height: number;
    link: string;
  }>;
  video_pictures: Array<{
    id: number;
    picture: string;
    nr: number;
  }>;
}

export interface PexelsVideoSearchResult {
  page: number;
  per_page: number;
  total_results: number;
  url: string;
  videos: PexelsVideo[];
  next_page?: string;
}

/**
 * Make authenticated request to Pexels API
 */
async function pexelsRequest(
  config: PexelsConfig,
  endpoint: string,
  params?: Record<string, string>
): Promise<Response> {
  const url = new URL(`https://api.pexels.com/v1${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  logger.debug({ url: url.toString() }, 'Making Pexels API request');

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': config.apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Pexels API error');
    throw new Error(`Pexels API error (${response.status}): ${error}`);
  }

  return response;
}

/**
 * Search photos (internal, unprotected)
 */
async function searchPhotosInternal(
  config: PexelsConfig,
  query: string,
  options?: {
    page?: number;
    per_page?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
    size?: 'large' | 'medium' | 'small';
    color?:
      | 'red'
      | 'orange'
      | 'yellow'
      | 'green'
      | 'turquoise'
      | 'blue'
      | 'violet'
      | 'pink'
      | 'brown'
      | 'black'
      | 'gray'
      | 'white';
    locale?: string;
  }
): Promise<PexelsPhotoSearchResult> {
  logger.info({ query, options }, 'Searching Pexels photos');

  const params: Record<string, string> = {
    query,
    page: options?.page?.toString() || '1',
    per_page: options?.per_page?.toString() || '15',
  };

  if (options?.orientation) params.orientation = options.orientation;
  if (options?.size) params.size = options.size;
  if (options?.color) params.color = options.color;
  if (options?.locale) params.locale = options.locale;

  const response = await pexelsRequest(config, '/search', params);
  const data = await response.json();

  logger.info(
    { query, total: data.total_results, resultsCount: data.photos.length },
    'Photos search completed'
  );

  return data;
}

/**
 * Search photos (protected with circuit breaker + rate limiting)
 */
const searchPhotosWithBreaker = createPexelsCircuitBreaker(searchPhotosInternal);
export const searchPhotos = withRateLimit(
  (
    config: PexelsConfig,
    query: string,
    options?: {
      page?: number;
      per_page?: number;
      orientation?: 'landscape' | 'portrait' | 'square';
      size?: 'large' | 'medium' | 'small';
      color?:
        | 'red'
        | 'orange'
        | 'yellow'
        | 'green'
        | 'turquoise'
        | 'blue'
        | 'violet'
        | 'pink'
        | 'brown'
        | 'black'
        | 'gray'
        | 'white';
      locale?: string;
    }
  ) => searchPhotosWithBreaker.fire(config, query, options),
  pexelsRateLimiter
);

/**
 * Get curated photos (internal, unprotected)
 */
async function getCuratedPhotosInternal(
  config: PexelsConfig,
  options?: {
    page?: number;
    per_page?: number;
  }
): Promise<PexelsPhotoSearchResult> {
  logger.info({ options }, 'Fetching curated Pexels photos');

  const params: Record<string, string> = {
    page: options?.page?.toString() || '1',
    per_page: options?.per_page?.toString() || '15',
  };

  const response = await pexelsRequest(config, '/curated', params);
  const data = await response.json();

  logger.info({ resultsCount: data.photos.length }, 'Curated photos fetched');
  return data;
}

/**
 * Get curated photos (protected with circuit breaker + rate limiting)
 */
const getCuratedPhotosWithBreaker = createPexelsCircuitBreaker(getCuratedPhotosInternal);
export const getCuratedPhotos = withRateLimit(
  (
    config: PexelsConfig,
    options?: {
      page?: number;
      per_page?: number;
    }
  ) => getCuratedPhotosWithBreaker.fire(config, options),
  pexelsRateLimiter
);

/**
 * Get photo by ID (internal, unprotected)
 */
async function getPhotoByIdInternal(
  config: PexelsConfig,
  photoId: number
): Promise<PexelsPhoto> {
  logger.info({ photoId }, 'Fetching Pexels photo by ID');

  const response = await pexelsRequest(config, `/photos/${photoId}`);
  const data = await response.json();

  logger.info({ photoId, photographer: data.photographer }, 'Photo fetched');
  return data;
}

/**
 * Get photo by ID (protected with circuit breaker + rate limiting)
 */
const getPhotoByIdWithBreaker = createPexelsCircuitBreaker(getPhotoByIdInternal);
export const getPhotoById = withRateLimit(
  (config: PexelsConfig, photoId: number) =>
    getPhotoByIdWithBreaker.fire(config, photoId),
  pexelsRateLimiter
);

/**
 * Search videos (internal, unprotected)
 */
async function searchVideosInternal(
  config: PexelsConfig,
  query: string,
  options?: {
    page?: number;
    per_page?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
    size?: 'large' | 'medium' | 'small';
    locale?: string;
  }
): Promise<PexelsVideoSearchResult> {
  logger.info({ query, options }, 'Searching Pexels videos');

  const params: Record<string, string> = {
    query,
    page: options?.page?.toString() || '1',
    per_page: options?.per_page?.toString() || '15',
  };

  if (options?.orientation) params.orientation = options.orientation;
  if (options?.size) params.size = options.size;
  if (options?.locale) params.locale = options.locale;

  const response = await fetch(
    `https://api.pexels.com/videos/search?${new URLSearchParams(params)}`,
    {
      headers: {
        'Authorization': config.apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Pexels API error');
    throw new Error(`Pexels API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  logger.info(
    { query, total: data.total_results, resultsCount: data.videos.length },
    'Videos search completed'
  );

  return data;
}

/**
 * Search videos (protected with circuit breaker + rate limiting)
 */
const searchVideosWithBreaker = createPexelsCircuitBreaker(searchVideosInternal);
export const searchVideos = withRateLimit(
  (
    config: PexelsConfig,
    query: string,
    options?: {
      page?: number;
      per_page?: number;
      orientation?: 'landscape' | 'portrait' | 'square';
      size?: 'large' | 'medium' | 'small';
      locale?: string;
    }
  ) => searchVideosWithBreaker.fire(config, query, options),
  pexelsRateLimiter
);

/**
 * Get popular videos (internal, unprotected)
 */
async function getPopularVideosInternal(
  config: PexelsConfig,
  options?: {
    page?: number;
    per_page?: number;
    min_width?: number;
    min_height?: number;
    min_duration?: number;
    max_duration?: number;
  }
): Promise<PexelsVideoSearchResult> {
  logger.info({ options }, 'Fetching popular Pexels videos');

  const params: Record<string, string> = {
    page: options?.page?.toString() || '1',
    per_page: options?.per_page?.toString() || '15',
  };

  if (options?.min_width) params.min_width = options.min_width.toString();
  if (options?.min_height) params.min_height = options.min_height.toString();
  if (options?.min_duration) params.min_duration = options.min_duration.toString();
  if (options?.max_duration) params.max_duration = options.max_duration.toString();

  const response = await fetch(
    `https://api.pexels.com/videos/popular?${new URLSearchParams(params)}`,
    {
      headers: {
        'Authorization': config.apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Pexels API error');
    throw new Error(`Pexels API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  logger.info({ resultsCount: data.videos.length }, 'Popular videos fetched');
  return data;
}

/**
 * Get popular videos (protected with circuit breaker + rate limiting)
 */
const getPopularVideosWithBreaker = createPexelsCircuitBreaker(getPopularVideosInternal);
export const getPopularVideos = withRateLimit(
  (
    config: PexelsConfig,
    options?: {
      page?: number;
      per_page?: number;
      min_width?: number;
      min_height?: number;
      min_duration?: number;
      max_duration?: number;
    }
  ) => getPopularVideosWithBreaker.fire(config, options),
  pexelsRateLimiter
);

/**
 * Get video by ID (internal, unprotected)
 */
async function getVideoByIdInternal(
  config: PexelsConfig,
  videoId: number
): Promise<PexelsVideo> {
  logger.info({ videoId }, 'Fetching Pexels video by ID');

  const response = await fetch(`https://api.pexels.com/videos/videos/${videoId}`, {
    headers: {
      'Authorization': config.apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Pexels API error');
    throw new Error(`Pexels API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  logger.info({ videoId, user: data.user.name }, 'Video fetched');
  return data;
}

/**
 * Get video by ID (protected with circuit breaker + rate limiting)
 */
const getVideoByIdWithBreaker = createPexelsCircuitBreaker(getVideoByIdInternal);
export const getVideoById = withRateLimit(
  (config: PexelsConfig, videoId: number) =>
    getVideoByIdWithBreaker.fire(config, videoId),
  pexelsRateLimiter
);

/**
 * Download photo (internal, unprotected)
 */
async function downloadPhotoInternal(
  config: PexelsConfig,
  photo: PexelsPhoto,
  size: 'original' | 'large2x' | 'large' | 'medium' | 'small' | 'tiny' = 'large'
): Promise<{ url: string; buffer: Buffer; photographer: string; photoId: number }> {
  logger.info(
    { photoId: photo.id, size, photographer: photo.photographer },
    'Downloading Pexels photo'
  );

  const imageUrl = photo.src[size];
  const imageResponse = await fetch(imageUrl);

  if (!imageResponse.ok) {
    throw new Error(`Failed to download photo: ${imageResponse.statusText}`);
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());

  logger.info(
    { photoId: photo.id, size: buffer.length, photographer: photo.photographer },
    'Photo downloaded successfully'
  );

  return {
    url: imageUrl,
    buffer,
    photographer: photo.photographer,
    photoId: photo.id,
  };
}

/**
 * Download photo (protected with circuit breaker + rate limiting)
 */
const downloadPhotoWithBreaker = createPexelsCircuitBreaker(downloadPhotoInternal);
export const downloadPhoto = withRateLimit(
  (
    config: PexelsConfig,
    photo: PexelsPhoto,
    size: 'original' | 'large2x' | 'large' | 'medium' | 'small' | 'tiny' = 'large'
  ) => downloadPhotoWithBreaker.fire(config, photo, size),
  pexelsRateLimiter
);

/**
 * Search and download photo in one operation (internal, unprotected)
 */
async function searchAndDownloadPhotoInternal(
  config: PexelsConfig,
  query: string,
  size: 'original' | 'large2x' | 'large' | 'medium' | 'small' | 'tiny' = 'large'
): Promise<{ url: string; buffer: Buffer; photographer: string; photoId: number }> {
  logger.info({ query, size }, 'Searching and downloading Pexels photo');

  // Search for photos
  const searchResult = await searchPhotosInternal(config, query, { per_page: 1 });

  if (searchResult.photos.length === 0) {
    throw new Error(`No photos found for query: ${query}`);
  }

  const photo = searchResult.photos[0];

  // Download the photo
  return downloadPhotoInternal(config, photo, size);
}

/**
 * Search and download photo in one operation (protected with circuit breaker + rate limiting)
 */
const searchAndDownloadPhotoWithBreaker = createPexelsCircuitBreaker(
  searchAndDownloadPhotoInternal
);
export const searchAndDownloadPhoto = withRateLimit(
  (
    config: PexelsConfig,
    query: string,
    size: 'original' | 'large2x' | 'large' | 'medium' | 'small' | 'tiny' = 'large'
  ) => searchAndDownloadPhotoWithBreaker.fire(config, query, size),
  pexelsRateLimiter
);

import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Unsplash API Client with Reliability Infrastructure
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (50 requests/hour for free tier)
 * - Structured logging
 * - Automatic error handling
 * - Download tracking (required by Unsplash API guidelines)
 *
 * API Documentation: https://unsplash.com/documentation
 */

// Unsplash rate limiter: 50 requests per hour (free tier)
const unsplashRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 72000, // 72 seconds between requests
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 60 * 1000, // Per hour
  id: 'unsplash-api',
});

// Unsplash circuit breaker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createUnsplashCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return createCircuitBreaker(fn, {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `unsplash:${fn.name}`,
  });
}

export interface UnsplashConfig {
  accessKey: string;
}

export interface UnsplashPhoto {
  id: string;
  created_at: string;
  updated_at: string;
  width: number;
  height: number;
  color: string;
  blur_hash: string;
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: {
    self: string;
    html: string;
    download: string;
    download_location: string;
  };
  user: {
    id: string;
    username: string;
    name: string;
    portfolio_url: string | null;
    bio: string | null;
    location: string | null;
    links: {
      self: string;
      html: string;
      photos: string;
    };
    profile_image: {
      small: string;
      medium: string;
      large: string;
    };
  };
  likes: number;
  downloads: number;
}

export interface UnsplashSearchResult {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

/**
 * Make authenticated request to Unsplash API
 */
async function unsplashRequest(
  config: UnsplashConfig,
  endpoint: string,
  params?: Record<string, string>
): Promise<Response> {
  const url = new URL(`https://api.unsplash.com${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  logger.debug({ url: url.toString() }, 'Making Unsplash API request');

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Client-ID ${config.accessKey}`,
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Unsplash API error');
    throw new Error(`Unsplash API error (${response.status}): ${error}`);
  }

  return response;
}

/**
 * Search photos (internal, unprotected)
 */
async function searchPhotosInternal(
  config: UnsplashConfig,
  query: string,
  options?: {
    page?: number;
    per_page?: number;
    order_by?: 'relevant' | 'latest';
    orientation?: 'landscape' | 'portrait' | 'squarish';
    color?:
      | 'black_and_white'
      | 'black'
      | 'white'
      | 'yellow'
      | 'orange'
      | 'red'
      | 'purple'
      | 'magenta'
      | 'green'
      | 'teal'
      | 'blue';
  }
): Promise<UnsplashSearchResult> {
  logger.info({ query, options }, 'Searching Unsplash photos');

  const params: Record<string, string> = {
    query,
    page: options?.page?.toString() || '1',
    per_page: options?.per_page?.toString() || '10',
  };

  if (options?.order_by) params.order_by = options.order_by;
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.color) params.color = options.color;

  const response = await unsplashRequest(config, '/search/photos', params);
  const data = await response.json();

  logger.info(
    { query, total: data.total, resultsCount: data.results.length },
    'Photos search completed'
  );

  return data;
}

/**
 * Search photos (protected with circuit breaker + rate limiting)
 */
const searchPhotosWithBreaker = createUnsplashCircuitBreaker(searchPhotosInternal);
export const searchPhotos = withRateLimit(
  (
    config: UnsplashConfig,
    query: string,
    options?: {
      page?: number;
      per_page?: number;
      order_by?: 'relevant' | 'latest';
      orientation?: 'landscape' | 'portrait' | 'squarish';
      color?:
        | 'black_and_white'
        | 'black'
        | 'white'
        | 'yellow'
        | 'orange'
        | 'red'
        | 'purple'
        | 'magenta'
        | 'green'
        | 'teal'
        | 'blue';
    }
  ) => searchPhotosWithBreaker.fire(config, query, options),
  unsplashRateLimiter
);

/**
 * Get a random photo (internal, unprotected)
 */
async function getRandomPhotoInternal(
  config: UnsplashConfig,
  options?: {
    query?: string;
    orientation?: 'landscape' | 'portrait' | 'squarish';
    count?: number;
  }
): Promise<UnsplashPhoto | UnsplashPhoto[]> {
  logger.info({ options }, 'Getting random Unsplash photo(s)');

  const params: Record<string, string> = {};
  if (options?.query) params.query = options.query;
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.count) params.count = options.count.toString();

  const response = await unsplashRequest(config, '/photos/random', params);
  const data = await response.json();

  logger.info(
    { isArray: Array.isArray(data), count: options?.count || 1 },
    'Random photo(s) fetched'
  );

  return data;
}

/**
 * Get a random photo (protected with circuit breaker + rate limiting)
 */
const getRandomPhotoWithBreaker = createUnsplashCircuitBreaker(getRandomPhotoInternal);
export const getRandomPhoto = withRateLimit(
  (
    config: UnsplashConfig,
    options?: {
      query?: string;
      orientation?: 'landscape' | 'portrait' | 'squarish';
      count?: number;
    }
  ) => getRandomPhotoWithBreaker.fire(config, options),
  unsplashRateLimiter
);

/**
 * Get photo by ID (internal, unprotected)
 */
async function getPhotoByIdInternal(
  config: UnsplashConfig,
  photoId: string
): Promise<UnsplashPhoto> {
  logger.info({ photoId }, 'Fetching Unsplash photo by ID');

  const response = await unsplashRequest(config, `/photos/${photoId}`);
  const data = await response.json();

  logger.info({ photoId, photographer: data.user.name }, 'Photo fetched');
  return data;
}

/**
 * Get photo by ID (protected with circuit breaker + rate limiting)
 */
const getPhotoByIdWithBreaker = createUnsplashCircuitBreaker(getPhotoByIdInternal);
export const getPhotoById = withRateLimit(
  (config: UnsplashConfig, photoId: string) =>
    getPhotoByIdWithBreaker.fire(config, photoId),
  unsplashRateLimiter
);

/**
 * Track photo download (internal, unprotected)
 * REQUIRED by Unsplash API guidelines when downloading photos
 */
async function trackDownloadInternal(
  config: UnsplashConfig,
  downloadLocation: string
): Promise<void> {
  logger.info({ downloadLocation }, 'Tracking Unsplash photo download');

  // Extract path from full URL if needed
  const path = downloadLocation.startsWith('http')
    ? new URL(downloadLocation).pathname + new URL(downloadLocation).search
    : downloadLocation;

  await unsplashRequest(config, path);

  logger.info('Download tracked successfully');
}

/**
 * Track photo download (protected with circuit breaker + rate limiting)
 * REQUIRED by Unsplash API guidelines when downloading photos
 */
const trackDownloadWithBreaker = createUnsplashCircuitBreaker(trackDownloadInternal);
export const trackDownload = withRateLimit(
  (config: UnsplashConfig, downloadLocation: string) =>
    trackDownloadWithBreaker.fire(config, downloadLocation),
  unsplashRateLimiter
);

/**
 * Download photo and track download (internal, unprotected)
 */
async function downloadPhotoInternal(
  config: UnsplashConfig,
  photo: UnsplashPhoto,
  size: 'raw' | 'full' | 'regular' | 'small' | 'thumb' = 'regular'
): Promise<{ url: string; buffer: Buffer; photographer: string; photoId: string }> {
  logger.info(
    { photoId: photo.id, size, photographer: photo.user.name },
    'Downloading Unsplash photo'
  );

  // Track download (required by Unsplash)
  await trackDownloadInternal(config, photo.links.download_location);

  // Download the actual image
  const imageUrl = photo.urls[size];
  const imageResponse = await fetch(imageUrl);

  if (!imageResponse.ok) {
    throw new Error(`Failed to download photo: ${imageResponse.statusText}`);
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());

  logger.info(
    { photoId: photo.id, size: buffer.length, photographer: photo.user.name },
    'Photo downloaded successfully'
  );

  return {
    url: imageUrl,
    buffer,
    photographer: photo.user.name,
    photoId: photo.id,
  };
}

/**
 * Download photo and track download (protected with circuit breaker + rate limiting)
 */
const downloadPhotoWithBreaker = createUnsplashCircuitBreaker(downloadPhotoInternal);
export const downloadPhoto = withRateLimit(
  (
    config: UnsplashConfig,
    photo: UnsplashPhoto,
    size: 'raw' | 'full' | 'regular' | 'small' | 'thumb' = 'regular'
  ) => downloadPhotoWithBreaker.fire(config, photo, size),
  unsplashRateLimiter
);

/**
 * List curated photos (internal, unprotected)
 */
async function listPhotosInternal(
  config: UnsplashConfig,
  options?: {
    page?: number;
    per_page?: number;
    order_by?: 'latest' | 'oldest' | 'popular';
  }
): Promise<UnsplashPhoto[]> {
  logger.info({ options }, 'Listing Unsplash photos');

  const params: Record<string, string> = {
    page: options?.page?.toString() || '1',
    per_page: options?.per_page?.toString() || '10',
  };

  if (options?.order_by) params.order_by = options.order_by;

  const response = await unsplashRequest(config, '/photos', params);
  const data = await response.json();

  logger.info({ photosCount: data.length }, 'Photos listed successfully');
  return data;
}

/**
 * List curated photos (protected with circuit breaker + rate limiting)
 */
const listPhotosWithBreaker = createUnsplashCircuitBreaker(listPhotosInternal);
export const listPhotos = withRateLimit(
  (
    config: UnsplashConfig,
    options?: {
      page?: number;
      per_page?: number;
      order_by?: 'latest' | 'oldest' | 'popular';
    }
  ) => listPhotosWithBreaker.fire(config, options),
  unsplashRateLimiter
);

/**
 * Get photo statistics (internal, unprotected)
 */
async function getPhotoStatsInternal(
  config: UnsplashConfig,
  photoId: string
): Promise<{
  id: string;
  downloads: { total: number };
  views: { total: number };
  likes: { total: number };
}> {
  logger.info({ photoId }, 'Fetching Unsplash photo statistics');

  const response = await unsplashRequest(config, `/photos/${photoId}/statistics`);
  const data = await response.json();

  logger.info(
    {
      photoId,
      downloads: data.downloads.total,
      views: data.views.total,
      likes: data.likes.total,
    },
    'Photo statistics fetched'
  );

  return data;
}

/**
 * Get photo statistics (protected with circuit breaker + rate limiting)
 */
const getPhotoStatsWithBreaker = createUnsplashCircuitBreaker(getPhotoStatsInternal);
export const getPhotoStats = withRateLimit(
  (config: UnsplashConfig, photoId: string) =>
    getPhotoStatsWithBreaker.fire(config, photoId),
  unsplashRateLimiter
);

/**
 * Search and download photo in one operation (internal, unprotected)
 */
async function searchAndDownloadInternal(
  config: UnsplashConfig,
  query: string,
  size: 'raw' | 'full' | 'regular' | 'small' | 'thumb' = 'regular'
): Promise<{ url: string; buffer: Buffer; photographer: string; photoId: string }> {
  logger.info({ query, size }, 'Searching and downloading Unsplash photo');

  // Search for photos
  const searchResult = await searchPhotosInternal(config, query, { per_page: 1 });

  if (searchResult.results.length === 0) {
    throw new Error(`No photos found for query: ${query}`);
  }

  const photo = searchResult.results[0];

  // Download the photo
  return downloadPhotoInternal(config, photo, size);
}

/**
 * Search and download photo in one operation (protected with circuit breaker + rate limiting)
 */
const searchAndDownloadWithBreaker = createUnsplashCircuitBreaker(
  searchAndDownloadInternal
);
export const searchAndDownload = withRateLimit(
  (
    config: UnsplashConfig,
    query: string,
    size: 'raw' | 'full' | 'regular' | 'small' | 'thumb' = 'regular'
  ) => searchAndDownloadWithBreaker.fire(config, query, size),
  unsplashRateLimiter
);

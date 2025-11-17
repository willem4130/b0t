import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Medium API Client with Reliability Infrastructure
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (60 requests/hour)
 * - Structured logging
 * - Automatic error handling
 *
 * API Documentation: https://github.com/Medium/medium-api-docs
 */

// Medium rate limiter: 60 requests per hour
const mediumRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 60000, // 1 minute between requests
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 60 * 1000, // Per hour
  id: 'medium-api',
});

// Medium circuit breaker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMediumCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return createCircuitBreaker(fn, {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `medium:${fn.name}`,
  });
}

export interface MediumConfig {
  accessToken: string;
}

export interface MediumPostData {
  title: string;
  contentFormat: 'html' | 'markdown';
  content: string;
  tags?: string[];
  canonicalUrl?: string;
  publishStatus?: 'public' | 'draft' | 'unlisted';
  license?: 'all-rights-reserved' | 'cc-40-by' | 'cc-40-by-sa' | 'cc-40-by-nd' | 'cc-40-by-nc' | 'cc-40-by-nc-nd' | 'cc-40-by-nc-sa' | 'cc-40-zero' | 'public-domain';
  notifyFollowers?: boolean;
}

export interface MediumUser {
  id: string;
  username: string;
  name: string;
  url: string;
  imageUrl: string;
}

export interface MediumPublication {
  id: string;
  name: string;
  description: string;
  url: string;
  imageUrl: string;
}

export interface MediumPost {
  id: string;
  title: string;
  authorId: string;
  url: string;
  canonicalUrl: string;
  publishStatus: string;
  publishedAt: number;
  license: string;
  licenseUrl: string;
  tags: string[];
}

/**
 * Make authenticated request to Medium API
 */
async function mediumRequest(
  config: MediumConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `https://api.medium.com/v1${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making Medium API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Medium API error');
    throw new Error(`Medium API error (${response.status}): ${error}`);
  }

  return response;
}

/**
 * Get authenticated user's details (internal, unprotected)
 */
async function getUserInternal(config: MediumConfig): Promise<MediumUser> {
  logger.info('Fetching Medium user details');

  const response = await mediumRequest(config, '/me');
  const data = await response.json();

  logger.info({ userId: data.data.id, username: data.data.username }, 'User details fetched');
  return data.data;
}

/**
 * Get authenticated user's details (protected with circuit breaker + rate limiting)
 */
const getUserWithBreaker = createMediumCircuitBreaker(getUserInternal);
export const getUser = withRateLimit(
  (config: MediumConfig) => getUserWithBreaker.fire(config),
  mediumRateLimiter
);

/**
 * Get user's publications (internal, unprotected)
 */
async function getUserPublicationsInternal(
  config: MediumConfig,
  userId: string
): Promise<MediumPublication[]> {
  logger.info({ userId }, 'Fetching user publications');

  const response = await mediumRequest(config, `/users/${userId}/publications`);
  const data = await response.json();

  logger.info(
    { userId, publicationsCount: data.data.length },
    'Publications fetched'
  );
  return data.data;
}

/**
 * Get user's publications (protected with circuit breaker + rate limiting)
 */
const getUserPublicationsWithBreaker = createMediumCircuitBreaker(getUserPublicationsInternal);
export const getUserPublications = withRateLimit(
  (config: MediumConfig, userId: string) =>
    getUserPublicationsWithBreaker.fire(config, userId),
  mediumRateLimiter
);

/**
 * Create a post under authenticated user (internal, unprotected)
 */
async function createPostInternal(
  config: MediumConfig,
  userId: string,
  postData: MediumPostData
): Promise<MediumPost> {
  logger.info(
    {
      userId,
      title: postData.title,
      publishStatus: postData.publishStatus || 'public',
    },
    'Creating Medium post'
  );

  const response = await mediumRequest(config, `/users/${userId}/posts`, {
    method: 'POST',
    body: JSON.stringify(postData),
  });

  const data = await response.json();

  logger.info(
    {
      postId: data.data.id,
      url: data.data.url,
      publishStatus: data.data.publishStatus,
    },
    'Medium post created successfully'
  );

  return data.data;
}

/**
 * Create a post under authenticated user (protected with circuit breaker + rate limiting)
 */
const createPostWithBreaker = createMediumCircuitBreaker(createPostInternal);
export const createPost = withRateLimit(
  (config: MediumConfig, userId: string, postData: MediumPostData) =>
    createPostWithBreaker.fire(config, userId, postData),
  mediumRateLimiter
);

/**
 * Create a post under a publication (internal, unprotected)
 */
async function createPublicationPostInternal(
  config: MediumConfig,
  publicationId: string,
  postData: MediumPostData
): Promise<MediumPost> {
  logger.info(
    {
      publicationId,
      title: postData.title,
      publishStatus: postData.publishStatus || 'public',
    },
    'Creating Medium post under publication'
  );

  const response = await mediumRequest(
    config,
    `/publications/${publicationId}/posts`,
    {
      method: 'POST',
      body: JSON.stringify(postData),
    }
  );

  const data = await response.json();

  logger.info(
    {
      postId: data.data.id,
      url: data.data.url,
      publishStatus: data.data.publishStatus,
    },
    'Medium post created under publication successfully'
  );

  return data.data;
}

/**
 * Create a post under a publication (protected with circuit breaker + rate limiting)
 */
const createPublicationPostWithBreaker = createMediumCircuitBreaker(
  createPublicationPostInternal
);
export const createPublicationPost = withRateLimit(
  (config: MediumConfig, publicationId: string, postData: MediumPostData) =>
    createPublicationPostWithBreaker.fire(config, publicationId, postData),
  mediumRateLimiter
);

/**
 * Get publication contributors (internal, unprotected)
 */
async function getPublicationContributorsInternal(
  config: MediumConfig,
  publicationId: string
): Promise<Array<{
  publicationId: string;
  userId: string;
  role: string;
}>> {
  logger.info({ publicationId }, 'Fetching publication contributors');

  const response = await mediumRequest(
    config,
    `/publications/${publicationId}/contributors`
  );
  const data = await response.json();

  logger.info(
    { publicationId, contributorsCount: data.data.length },
    'Publication contributors fetched'
  );
  return data.data;
}

/**
 * Get publication contributors (protected with circuit breaker + rate limiting)
 */
const getPublicationContributorsWithBreaker = createMediumCircuitBreaker(
  getPublicationContributorsInternal
);
export const getPublicationContributors = withRateLimit(
  (config: MediumConfig, publicationId: string) =>
    getPublicationContributorsWithBreaker.fire(config, publicationId),
  mediumRateLimiter
);

/**
 * Validate Medium access token (internal, unprotected)
 */
async function validateTokenInternal(config: MediumConfig): Promise<boolean> {
  logger.info('Validating Medium access token');

  try {
    await getUserInternal(config);
    logger.info('Medium access token is valid');
    return true;
  } catch (error) {
    logger.warn({ error }, 'Medium access token is invalid');
    return false;
  }
}

/**
 * Validate Medium access token (protected with circuit breaker + rate limiting)
 */
const validateTokenWithBreaker = createMediumCircuitBreaker(validateTokenInternal);
export const validateToken = withRateLimit(
  (config: MediumConfig) => validateTokenWithBreaker.fire(config),
  mediumRateLimiter
);

/**
 * Create a draft post with auto-save (internal, unprotected)
 */
async function createDraftInternal(
  config: MediumConfig,
  userId: string,
  postData: Omit<MediumPostData, 'publishStatus'>
): Promise<MediumPost> {
  logger.info({ userId, title: postData.title }, 'Creating Medium draft');

  return createPostInternal(config, userId, {
    ...postData,
    publishStatus: 'draft',
  });
}

/**
 * Create a draft post with auto-save (protected with circuit breaker + rate limiting)
 */
const createDraftWithBreaker = createMediumCircuitBreaker(createDraftInternal);
export const createDraft = withRateLimit(
  (config: MediumConfig, userId: string, postData: Omit<MediumPostData, 'publishStatus'>) =>
    createDraftWithBreaker.fire(config, userId, postData),
  mediumRateLimiter
);

import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Ghost CMS API Client with Reliability Infrastructure
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (100 requests/hour)
 * - Structured logging
 * - Automatic error handling
 *
 * API Documentation: https://ghost.org/docs/admin-api/
 */

// Ghost rate limiter: 100 requests per hour
const ghostRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 36000, // 36 seconds between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 60 * 1000, // Per hour
  id: 'ghost-api',
});

// Ghost circuit breaker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createGhostCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return createCircuitBreaker(fn, {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `ghost:${fn.name}`,
  });
}

export interface GhostConfig {
  url: string; // e.g., https://yourblog.ghost.io
  adminApiKey: string;
}

export interface GhostPostData {
  title: string;
  html?: string;
  mobiledoc?: string;
  lexical?: string;
  feature_image?: string;
  featured?: boolean;
  status?: 'published' | 'draft' | 'scheduled';
  published_at?: string;
  tags?: Array<{ name: string }>;
  authors?: Array<{ id: string }>;
  excerpt?: string;
  meta_title?: string;
  meta_description?: string;
  og_image?: string;
  og_title?: string;
  og_description?: string;
  twitter_image?: string;
  twitter_title?: string;
  twitter_description?: string;
  custom_excerpt?: string;
  canonical_url?: string;
}

export interface GhostPost {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  html?: string;
  feature_image?: string;
  featured: boolean;
  status: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
  url: string;
  excerpt?: string;
  tags?: Array<{ id: string; name: string; slug: string }>;
  authors?: Array<{ id: string; name: string; slug: string }>;
}

export interface GhostTag {
  id: string;
  name: string;
  slug: string;
  description?: string;
  feature_image?: string;
  visibility: string;
  meta_title?: string;
  meta_description?: string;
}

/**
 * Generate JWT token for Ghost Admin API
 */
async function generateJWT(config: GhostConfig): Promise<string> {
  const [id, secret] = config.adminApiKey.split(':');

  // Ghost uses HS256 JWT - for production, use a proper JWT library
  // This is a simplified version
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })
  ).toString('base64url');

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iat: now,
      exp: now + 300, // 5 minutes
      aud: '/admin/',
    })
  ).toString('base64url');

  const crypto = await import('crypto');
  const signature = Buffer.from(
    crypto
      .createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(`${header}.${payload}`)
      .digest('base64url')
  ).toString('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Make authenticated request to Ghost Admin API
 */
async function ghostRequest(
  config: GhostConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await generateJWT(config);
  const url = `${config.url}/ghost/api/admin${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making Ghost API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Ghost ${token}`,
      'Content-Type': 'application/json',
      'Accept-Version': 'v5.0',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Ghost API error');
    throw new Error(`Ghost API error (${response.status}): ${error}`);
  }

  return response;
}

/**
 * Create a new post (internal, unprotected)
 */
async function createPostInternal(
  config: GhostConfig,
  postData: GhostPostData
): Promise<GhostPost> {
  logger.info(
    {
      title: postData.title,
      status: postData.status || 'draft',
    },
    'Creating Ghost post'
  );

  const response = await ghostRequest(config, '/posts/', {
    method: 'POST',
    body: JSON.stringify({ posts: [postData] }),
  });

  const data = await response.json();
  const post = data.posts[0];

  logger.info(
    {
      postId: post.id,
      slug: post.slug,
      status: post.status,
      url: post.url,
    },
    'Ghost post created successfully'
  );

  return post;
}

/**
 * Create a new post (protected with circuit breaker + rate limiting)
 */
const createPostWithBreaker = createGhostCircuitBreaker(createPostInternal);
export const createPost = withRateLimit(
  (config: GhostConfig, postData: GhostPostData) =>
    createPostWithBreaker.fire(config, postData),
  ghostRateLimiter
);

/**
 * Update an existing post (internal, unprotected)
 */
async function updatePostInternal(
  config: GhostConfig,
  postId: string,
  postData: Partial<GhostPostData>,
  updatedAt: string
): Promise<GhostPost> {
  logger.info({ postId }, 'Updating Ghost post');

  const response = await ghostRequest(config, `/posts/${postId}/`, {
    method: 'PUT',
    body: JSON.stringify({
      posts: [
        {
          ...postData,
          updated_at: updatedAt, // Required for collision detection
        },
      ],
    }),
  });

  const data = await response.json();
  const post = data.posts[0];

  logger.info(
    {
      postId: post.id,
      slug: post.slug,
      status: post.status,
    },
    'Ghost post updated successfully'
  );

  return post;
}

/**
 * Update an existing post (protected with circuit breaker + rate limiting)
 */
const updatePostWithBreaker = createGhostCircuitBreaker(updatePostInternal);
export const updatePost = withRateLimit(
  (config: GhostConfig, postId: string, postData: Partial<GhostPostData>, updatedAt: string) =>
    updatePostWithBreaker.fire(config, postId, postData, updatedAt),
  ghostRateLimiter
);

/**
 * Get posts (internal, unprotected)
 */
async function getPostsInternal(
  config: GhostConfig,
  options?: {
    limit?: number;
    filter?: string;
    include?: string;
    order?: string;
  }
): Promise<GhostPost[]> {
  logger.info({ options }, 'Fetching Ghost posts');

  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.filter) params.append('filter', options.filter);
  if (options?.include) params.append('include', options.include);
  if (options?.order) params.append('order', options.order);

  const queryString = params.toString();
  const endpoint = `/posts/${queryString ? `?${queryString}` : ''}`;

  const response = await ghostRequest(config, endpoint);
  const data = await response.json();

  logger.info(
    { postsCount: data.posts.length },
    'Ghost posts fetched successfully'
  );

  return data.posts;
}

/**
 * Get posts (protected with circuit breaker + rate limiting)
 */
const getPostsWithBreaker = createGhostCircuitBreaker(getPostsInternal);
export const getPosts = withRateLimit(
  (
    config: GhostConfig,
    options?: {
      limit?: number;
      filter?: string;
      include?: string;
      order?: string;
    }
  ) => getPostsWithBreaker.fire(config, options),
  ghostRateLimiter
);

/**
 * Get a single post by ID (internal, unprotected)
 */
async function getPostByIdInternal(
  config: GhostConfig,
  postId: string,
  include?: string
): Promise<GhostPost> {
  logger.info({ postId }, 'Fetching Ghost post by ID');

  const params = new URLSearchParams();
  if (include) params.append('include', include);

  const queryString = params.toString();
  const endpoint = `/posts/${postId}/${queryString ? `?${queryString}` : ''}`;

  const response = await ghostRequest(config, endpoint);
  const data = await response.json();

  logger.info({ postId, slug: data.posts[0].slug }, 'Ghost post fetched');
  return data.posts[0];
}

/**
 * Get a single post by ID (protected with circuit breaker + rate limiting)
 */
const getPostByIdWithBreaker = createGhostCircuitBreaker(getPostByIdInternal);
export const getPostById = withRateLimit(
  (config: GhostConfig, postId: string, include?: string) =>
    getPostByIdWithBreaker.fire(config, postId, include),
  ghostRateLimiter
);

/**
 * Delete a post (internal, unprotected)
 */
async function deletePostInternal(
  config: GhostConfig,
  postId: string
): Promise<void> {
  logger.info({ postId }, 'Deleting Ghost post');

  await ghostRequest(config, `/posts/${postId}/`, {
    method: 'DELETE',
  });

  logger.info({ postId }, 'Ghost post deleted successfully');
}

/**
 * Delete a post (protected with circuit breaker + rate limiting)
 */
const deletePostWithBreaker = createGhostCircuitBreaker(deletePostInternal);
export const deletePost = withRateLimit(
  (config: GhostConfig, postId: string) =>
    deletePostWithBreaker.fire(config, postId),
  ghostRateLimiter
);

/**
 * Publish a draft post (internal, unprotected)
 */
async function publishPostInternal(
  config: GhostConfig,
  postId: string,
  updatedAt: string
): Promise<GhostPost> {
  logger.info({ postId }, 'Publishing Ghost post');

  return updatePostInternal(
    config,
    postId,
    {
      status: 'published',
      published_at: new Date().toISOString(),
    },
    updatedAt
  );
}

/**
 * Publish a draft post (protected with circuit breaker + rate limiting)
 */
const publishPostWithBreaker = createGhostCircuitBreaker(publishPostInternal);
export const publishPost = withRateLimit(
  (config: GhostConfig, postId: string, updatedAt: string) =>
    publishPostWithBreaker.fire(config, postId, updatedAt),
  ghostRateLimiter
);

/**
 * Unpublish a post (internal, unprotected)
 */
async function unpublishPostInternal(
  config: GhostConfig,
  postId: string,
  updatedAt: string
): Promise<GhostPost> {
  logger.info({ postId }, 'Unpublishing Ghost post');

  return updatePostInternal(
    config,
    postId,
    {
      status: 'draft',
    },
    updatedAt
  );
}

/**
 * Unpublish a post (protected with circuit breaker + rate limiting)
 */
const unpublishPostWithBreaker = createGhostCircuitBreaker(unpublishPostInternal);
export const unpublishPost = withRateLimit(
  (config: GhostConfig, postId: string, updatedAt: string) =>
    unpublishPostWithBreaker.fire(config, postId, updatedAt),
  ghostRateLimiter
);

/**
 * Create or update tags (internal, unprotected)
 */
async function createTagInternal(
  config: GhostConfig,
  tagData: {
    name: string;
    slug?: string;
    description?: string;
  }
): Promise<GhostTag> {
  logger.info({ tagName: tagData.name }, 'Creating Ghost tag');

  const response = await ghostRequest(config, '/tags/', {
    method: 'POST',
    body: JSON.stringify({ tags: [tagData] }),
  });

  const data = await response.json();
  const tag = data.tags[0];

  logger.info({ tagId: tag.id, tagName: tag.name }, 'Ghost tag created');
  return tag;
}

/**
 * Create or update tags (protected with circuit breaker + rate limiting)
 */
const createTagWithBreaker = createGhostCircuitBreaker(createTagInternal);
export const createTag = withRateLimit(
  (
    config: GhostConfig,
    tagData: {
      name: string;
      slug?: string;
      description?: string;
    }
  ) => createTagWithBreaker.fire(config, tagData),
  ghostRateLimiter
);

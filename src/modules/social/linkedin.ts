import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * LinkedIn Module
 *
 * Post and manage LinkedIn content
 * - Share posts
 * - Comment on posts
 * - Get profile information
 * - List connections
 * - Built-in resilience
 *
 * Perfect for:
 * - Professional content sharing
 * - LinkedIn automation
 * - Network management
 * - Professional social media workflows
 */

const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;

if (!LINKEDIN_ACCESS_TOKEN) {
  logger.warn('⚠️  LINKEDIN_ACCESS_TOKEN not set. LinkedIn features will not work.');
}

const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest';

// Rate limiter: LinkedIn allows 60 req/min for most endpoints
const linkedinRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 1000, // 1000ms between requests = 60/min
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60000,
  id: 'linkedin',
});

export interface LinkedInProfile {
  id: string;
  firstName: string;
  lastName: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: {
    displayImage: string;
  };
}

export interface LinkedInPost {
  id: string;
  commentary: string;
  created: number;
  lastModified: number;
  visibility: 'PUBLIC' | 'CONNECTIONS_ONLY';
}

export interface LinkedInComment {
  id: string;
  actor: string;
  message: string;
  created: number;
}

/**
 * Get current profile (internal)
 */
async function getProfileInternal(): Promise<LinkedInProfile> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    throw new Error('LinkedIn access token not set. Set LINKEDIN_ACCESS_TOKEN.');
  }

  logger.info({}, 'Fetching LinkedIn profile');

  const response = await fetch(`${LINKEDIN_API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'LinkedIn-Version': '202411',
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.statusText}`);
  }

  const profile = (await response.json()) as LinkedInProfile;

  logger.info(
    {
      profileId: profile.id,
      name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
    },
    'LinkedIn profile fetched'
  );
  return profile;
}

/**
 * Get profile (protected)
 */
const getProfileWithBreaker = createCircuitBreaker(getProfileInternal, {
  timeout: 10000,
  name: 'linkedin-get-profile',
});

export const getProfile = withRateLimit(
  () => getProfileWithBreaker.fire(),
  linkedinRateLimiter
);

/**
 * Create a post (internal)
 */
async function createPostInternal(
  text: string,
  visibility: 'PUBLIC' | 'CONNECTIONS_ONLY' = 'PUBLIC'
): Promise<LinkedInPost> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    throw new Error('LinkedIn access token not set. Set LINKEDIN_ACCESS_TOKEN.');
  }

  logger.info(
    {
      textLength: text.length,
      visibility,
    },
    'Creating LinkedIn post'
  );

  const payload = {
    commentary: text,
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': visibility,
    },
    distribution: {
      feedDistribution: 'UNRESTRICTED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
  };

  const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'LinkedIn-Version': '202411',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.statusText}`);
  }

  const post = (await response.json()) as LinkedInPost;

  logger.info({ postId: post.id }, 'LinkedIn post created');
  return post;
}

/**
 * Create post (protected)
 */
const createPostWithBreaker = createCircuitBreaker(createPostInternal, {
  timeout: 15000,
  name: 'linkedin-create-post',
});

export const createPost = withRateLimit(
  (text: string, visibility?: 'PUBLIC' | 'CONNECTIONS_ONLY') =>
    createPostWithBreaker.fire(text, visibility),
  linkedinRateLimiter
);

/**
 * Get post details (internal)
 */
async function getPostInternal(postId: string): Promise<LinkedInPost> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    throw new Error('LinkedIn access token not set. Set LINKEDIN_ACCESS_TOKEN.');
  }

  logger.info({ postId }, 'Fetching LinkedIn post');

  const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts/${postId}`, {
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'LinkedIn-Version': '202411',
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.statusText}`);
  }

  const post = (await response.json()) as LinkedInPost;

  logger.info({ postId }, 'LinkedIn post fetched');
  return post;
}

/**
 * Get post (protected)
 */
const getPostWithBreaker = createCircuitBreaker(getPostInternal, {
  timeout: 10000,
  name: 'linkedin-get-post',
});

export const getPost = withRateLimit(
  (postId: string) => getPostWithBreaker.fire(postId),
  linkedinRateLimiter
);

/**
 * Get comments on a post (internal)
 */
async function getCommentsInternal(postId: string): Promise<LinkedInComment[]> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    throw new Error('LinkedIn access token not set. Set LINKEDIN_ACCESS_TOKEN.');
  }

  logger.info({ postId }, 'Fetching LinkedIn comments');

  const params = new URLSearchParams({
    parentId: postId,
  });

  const response = await fetch(`${LINKEDIN_API_BASE}/comments?${params}`, {
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'LinkedIn-Version': '202411',
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { elements: LinkedInComment[] };

  logger.info({ commentCount: data.elements.length }, 'LinkedIn comments fetched');
  return data.elements;
}

/**
 * Get comments (protected)
 */
const getCommentsWithBreaker = createCircuitBreaker(getCommentsInternal, {
  timeout: 15000,
  name: 'linkedin-get-comments',
});

export const getComments = withRateLimit(
  (postId: string) => getCommentsWithBreaker.fire(postId),
  linkedinRateLimiter
);

/**
 * Add a comment to a post (internal)
 */
async function addCommentInternal(postId: string, message: string): Promise<LinkedInComment> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    throw new Error('LinkedIn access token not set. Set LINKEDIN_ACCESS_TOKEN.');
  }

  logger.info({ postId, messageLength: message.length }, 'Adding LinkedIn comment');

  const payload = {
    parentId: postId,
    message,
  };

  const response = await fetch(`${LINKEDIN_API_BASE}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      'LinkedIn-Version': '202411',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.statusText}`);
  }

  const comment = (await response.json()) as LinkedInComment;

  logger.info({ commentId: comment.id }, 'LinkedIn comment added');
  return comment;
}

/**
 * Add comment (protected)
 */
const addCommentWithBreaker = createCircuitBreaker(addCommentInternal, {
  timeout: 15000,
  name: 'linkedin-add-comment',
});

export const addComment = withRateLimit(
  (postId: string, message: string) => addCommentWithBreaker.fire(postId, message),
  linkedinRateLimiter
);

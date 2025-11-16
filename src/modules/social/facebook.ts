import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter } from '@/lib/rate-limiter';
import type { UserCredential } from '@/lib/schema';

/**
 * Facebook Graph API Client
 *
 * Requires:
 * - Facebook Page (Business Page)
 * - Page Access Token from Facebook OAuth
 * - Permissions: pages_read_engagement, pages_manage_posts, pages_manage_metadata
 *
 * Features:
 * - Circuit breaker for API failures
 * - Rate limiting (200 calls/hour per Facebook API limits)
 * - Automatic retries and error handling
 * - Post and comment fetching
 * - Engagement statistics
 */

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Facebook API Rate Limiter: 200 calls per hour
const facebookRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 200, // ~18 seconds between calls = ~200 calls/hour
  reservoir: 200,
  reservoirRefreshAmount: 200,
  reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
  id: 'facebook-api',
});

interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  shares?: {
    count: number;
  };
  likes?: {
    summary: {
      total_count: number;
    };
  };
  comments?: {
    summary: {
      total_count: number;
    };
  };
  reactions?: {
    summary: {
      total_count: number;
    };
  };
}

// Type definitions for future use
// interface FacebookComment {
//   id: string;
//   message: string;
//   created_time: string;
//   from: {
//     id: string;
//     name: string;
//   };
//   like_count?: number;
//   comment_count?: number;
//   parent?: {
//     id: string;
//   };
// }

// interface FacebookPageInsights {
//   page_impressions: number;
//   page_engaged_users: number;
//   page_fan_adds: number;
//   page_fan_removes: number;
// }

/**
 * Get access token from credential or environment
 * In workflows, credentials are injected via the workflow context
 * For direct module usage, falls back to environment variable
 */
function getAccessToken(credential?: UserCredential | string): string {
  // If credential is passed as a string (access_token from decrypted credential)
  if (typeof credential === 'string') {
    return credential;
  }

  // If credential object is passed (legacy support)
  if (credential && typeof credential === 'object' && 'encryptedValue' in credential) {
    return credential.encryptedValue;
  }

  // Fallback to environment variable for development/testing
  const envToken = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!envToken) {
    throw new Error('Facebook access token not configured. Please add credentials via Settings → Credentials (platform: facebook)');
  }
  return envToken;
}

/**
 * Get Facebook page posts (Internal)
 */
async function _getFacebookPosts(params: {
  pageId: string;
  limit?: number;
  fields?: string;
  credential?: UserCredential | string;
}) {
  const { pageId, limit = 25, fields, credential } = params;
  const accessToken = getAccessToken(credential);

  const defaultFields = 'id,message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true),reactions.summary(true)';

  const response = await axios.get(`${BASE_URL}/${pageId}/posts`, {
    params: {
      access_token: accessToken,
      fields: fields || defaultFields,
      limit,
    },
  });

  return response.data;
}

/**
 * Get Facebook page posts with engagement stats (Protected)
 *
 * @param params.pageId - Facebook Page ID
 * @param params.limit - Number of posts to fetch (default: 25)
 * @param params.fields - Custom fields to retrieve
 * @param params.credential - Access token (string) or UserCredential object
 */
export const getFacebookPosts = createCircuitBreaker(
  async (params: {
    pageId: string;
    limit?: number;
    fields?: string;
    credential?: UserCredential | string;
  }) => {
    return await facebookRateLimiter.schedule(() => _getFacebookPosts(params));
  },
  {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'facebook-get-posts',
  }
).fire;

/**
 * Get comments on a Facebook post (Internal)
 */
async function _getFacebookComments(params: {
  postId: string;
  limit?: number;
  filter?: 'stream' | 'toplevel';
  credential?: UserCredential | string;
}) {
  const { postId, limit = 100, filter = 'stream', credential } = params;
  const accessToken = getAccessToken(credential);

  const response = await axios.get(`${BASE_URL}/${postId}/comments`, {
    params: {
      access_token: accessToken,
      fields: 'id,message,created_time,from,like_count,comment_count,parent',
      limit,
      filter, // 'stream' includes replies, 'toplevel' only parent comments
    },
  });

  return response.data;
}

/**
 * Get comments on a Facebook post (Protected)
 *
 * @param params.postId - Facebook Post ID
 * @param params.limit - Number of comments to fetch (default: 100)
 * @param params.filter - 'stream' (all) or 'toplevel' (parent only)
 * @param params.credential - Access token (string) or UserCredential object
 */
export const getFacebookComments = createCircuitBreaker(
  async (params: {
    postId: string;
    limit?: number;
    filter?: 'stream' | 'toplevel';
    credential?: UserCredential | string;
  }) => {
    return await facebookRateLimiter.schedule(() => _getFacebookComments(params));
  },
  {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'facebook-get-comments',
  }
).fire;

/**
 * Reply to a Facebook comment (Internal)
 */
async function _replyToFacebookComment(params: {
  commentId: string;
  message: string;
  credential?: UserCredential | string;
}) {
  const { commentId, message, credential } = params;
  const accessToken = getAccessToken(credential);

  const response = await axios.post(
    `${BASE_URL}/${commentId}/comments`,
    {
      message,
    },
    {
      params: {
        access_token: accessToken,
      },
    }
  );

  return response.data;
}

/**
 * Reply to a Facebook comment (Protected)
 *
 * @param params.commentId - Facebook Comment ID
 * @param params.message - Reply message
 * @param params.credential - Access token (string) or UserCredential object
 */
export const replyToFacebookComment = createCircuitBreaker(
  async (params: {
    commentId: string;
    message: string;
    credential?: UserCredential | string;
  }) => {
    return await facebookRateLimiter.schedule(() => _replyToFacebookComment(params));
  },
  {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'facebook-reply-comment',
  }
).fire;

/**
 * Get Facebook page insights (Internal)
 */
async function _getFacebookPageInsights(params: {
  pageId: string;
  period?: 'day' | 'week' | 'days_28';
  credential?: UserCredential | string;
}) {
  const { pageId, period = 'day', credential } = params;
  const accessToken = getAccessToken(credential);

  const metrics = [
    'page_impressions',
    'page_engaged_users',
    'page_fan_adds',
    'page_fan_removes',
  ];

  const response = await axios.get(`${BASE_URL}/${pageId}/insights`, {
    params: {
      access_token: accessToken,
      metric: metrics.join(','),
      period,
    },
  });

  return response.data;
}

/**
 * Get Facebook page insights (Protected)
 *
 * @param params.pageId - Facebook Page ID
 * @param params.period - Time period ('day', 'week', 'days_28')
 * @param params.credential - Access token (string) or UserCredential object
 */
export const getFacebookPageInsights = createCircuitBreaker(
  async (params: {
    pageId: string;
    period?: 'day' | 'week' | 'days_28';
    credential?: UserCredential | string;
  }) => {
    return await facebookRateLimiter.schedule(() => _getFacebookPageInsights(params));
  },
  {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'facebook-get-insights',
  }
).fire;

/**
 * Get post engagement statistics (Internal)
 */
async function _getPostEngagement(params: {
  postId: string;
  credential?: UserCredential | string;
}) {
  const { postId, credential } = params;
  const accessToken = getAccessToken(credential);

  const response = await axios.get(`${BASE_URL}/${postId}`, {
    params: {
      access_token: accessToken,
      fields: 'id,message,created_time,likes.summary(true),comments.summary(true),shares,reactions.summary(true)',
    },
  });

  const data = response.data;

  return {
    postId: data.id,
    message: data.message,
    createdTime: data.created_time,
    likes: data.likes?.summary?.total_count || 0,
    comments: data.comments?.summary?.total_count || 0,
    shares: data.shares?.count || 0,
    reactions: data.reactions?.summary?.total_count || 0,
    totalEngagement: (data.likes?.summary?.total_count || 0) +
                     (data.comments?.summary?.total_count || 0) +
                     (data.shares?.count || 0) +
                     (data.reactions?.summary?.total_count || 0),
  };
}

/**
 * Get post engagement statistics (Protected)
 *
 * Returns aggregated engagement metrics for a post
 *
 * @param params.postId - Facebook Post ID
 * @param params.credential - Access token (string) or UserCredential object
 */
export const getPostEngagement = createCircuitBreaker(
  async (params: {
    postId: string;
    credential?: UserCredential | string;
  }) => {
    return await facebookRateLimiter.schedule(() => _getPostEngagement(params));
  },
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'facebook-get-post-engagement',
  }
).fire;

/**
 * Convenience function: Get posts with all comments
 */
export async function getPostsWithComments(params: {
  pageId: string;
  postLimit?: number;
  commentLimit?: number;
  credential?: UserCredential | string;
}) {
  const { pageId, postLimit = 10, commentLimit = 100, credential } = params;

  // Get posts
  const postsResponse = await getFacebookPosts({
    pageId,
    limit: postLimit,
    credential,
  });

  // Get comments for each post
  const postsWithComments = await Promise.all(
    postsResponse.data.map(async (post: FacebookPost) => {
      const commentsResponse = await getFacebookComments({
        postId: post.id,
        limit: commentLimit,
        credential,
      });

      return {
        ...post,
        commentsData: commentsResponse.data || [],
      };
    })
  );

  return postsWithComments;
}

import axios from 'axios';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter } from '@/lib/rate-limiter';

/**
 * Instagram Graph API Client
 *
 * Requires:
 * - Instagram Business or Creator Account
 * - Linked to Facebook Page
 * - Access token from Facebook OAuth
 *
 * Features:
 * - Circuit breaker for API failures
 * - Rate limiting (200 calls/hour per Instagram API limits)
 * - Automatic retries and error handling
 */

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

if (!INSTAGRAM_ACCESS_TOKEN) {
  logger.warn('Instagram access token not set. Instagram features will not work.');
}

// Instagram API Rate Limiter: 200 calls per hour
const instagramRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 200, // ~18 seconds between calls = ~200 calls/hour
  reservoir: 200,
  reservoirRefreshAmount: 200,
  reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
  id: 'instagram-api',
});

/**
 * Reply to an Instagram comment (Internal - wrapped with protections)
 */
async function _replyToInstagramComment(commentId: string, message: string) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('Instagram access token not configured');
  }

  const response = await axios.post(
    `${BASE_URL}/${commentId}/replies`,
    {
      message,
    },
    {
      params: {
        access_token: INSTAGRAM_ACCESS_TOKEN,
      },
    }
  );

  return response.data;
}

/**
 * Reply to an Instagram comment (Protected with circuit breaker + rate limiting)
 *
 * @param commentId - The Instagram comment ID
 * @param message - Your reply message
 */
export const replyToInstagramComment = createCircuitBreaker(
  async (commentId: string, message: string) => {
    return await instagramRateLimiter.schedule(() => _replyToInstagramComment(commentId, message));
  },
  {
    timeout: 15000, // 15 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 60000, // 1 minute
    name: 'instagram-reply-comment',
  }
).fire;

/**
 * Get comments on an Instagram media post (Internal)
 */
async function _getInstagramComments(mediaId: string) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('Instagram access token not configured');
  }

  const response = await axios.get(`${BASE_URL}/${mediaId}/comments`, {
    params: {
      access_token: INSTAGRAM_ACCESS_TOKEN,
      fields: 'id,text,username,timestamp',
    },
  });

  return response.data;
}

/**
 * Get comments on an Instagram media post (Protected)
 */
export const getInstagramComments = createCircuitBreaker(
  async (mediaId: string) => {
    return await instagramRateLimiter.schedule(() => _getInstagramComments(mediaId));
  },
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'instagram-get-comments',
  }
).fire;

/**
 * Send Instagram Direct Message (Internal)
 */
async function _sendInstagramDM(recipientId: string, message: string) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('Instagram access token not configured');
  }

  const response = await axios.post(
    `${BASE_URL}/me/messages`,
    {
      recipient: { id: recipientId },
      message: { text: message },
    },
    {
      params: {
        access_token: INSTAGRAM_ACCESS_TOKEN,
      },
    }
  );

  return response.data;
}

/**
 * Send Instagram Direct Message (Protected)
 *
 * Note: Requires Messenger API for Instagram
 * Requires Instagram Professional account linked to Facebook Page
 */
export const sendInstagramDM = createCircuitBreaker(
  async (recipientId: string, message: string) => {
    return await instagramRateLimiter.schedule(() => _sendInstagramDM(recipientId, message));
  },
  {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'instagram-send-dm',
  }
).fire;

/**
 * Reply to an Instagram DM (Protected)
 */
export async function replyToInstagramDM(senderId: string, message: string) {
  return sendInstagramDM(senderId, message);
}

/**
 * Get Instagram media posts (Internal)
 */
async function _getInstagramMedia(limit: number) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('Instagram access token not configured');
  }

  const response = await axios.get(`${BASE_URL}/me/media`, {
    params: {
      access_token: INSTAGRAM_ACCESS_TOKEN,
      fields: 'id,caption,media_type,media_url,timestamp,like_count,comments_count',
      limit,
    },
  });

  return response.data;
}

/**
 * Get Instagram media (posts) for the authenticated user (Protected)
 */
export const getInstagramMedia = createCircuitBreaker(
  async (limit = 10) => {
    return await instagramRateLimiter.schedule(() => _getInstagramMedia(limit));
  },
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    name: 'instagram-get-media',
  }
).fire;

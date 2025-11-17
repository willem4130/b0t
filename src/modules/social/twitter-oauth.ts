import { TwitterApi } from 'twitter-api-v2';
import { createTwitterCircuitBreaker } from '@/lib/resilience';
import { twitterUserRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Twitter OAuth 2.0 Module (for Workflows)
 *
 * Uses user's OAuth 2.0 access tokens (from accounts table).
 * Compatible with workflow credential system.
 *
 * Features:
 * - User-level OAuth 2.0 tokens
 * - Circuit breaker protection
 * - Rate limiting
 * - Structured logging
 */

/**
 * Create Twitter client from OAuth 2.0 access token
 */
function createTwitterClient(accessToken: string): TwitterApi {
  return new TwitterApi(accessToken);
}

/**
 * Reply to a tweet using OAuth 2.0 token (internal)
 */
async function replyToTweetInternal(params: {
  tweetId: string;
  text: string;
  accessToken: string;
}) {
  const { tweetId, text, accessToken } = params;

  if (!accessToken) {
    throw new Error('Twitter access token is required. Please connect your Twitter account.');
  }

  const client = createTwitterClient(accessToken);

  logger.info({ tweetId, textLength: text.length }, 'Replying to tweet with OAuth');
  const reply = await client.v2.reply(text, tweetId);
  logger.info({ tweetId, replyId: reply.data.id }, 'Reply posted successfully');

  return reply.data;
}

/**
 * Reply to a tweet (workflow-compatible)
 * Protected with circuit breaker + rate limiting
 */
const replyToTweetWithBreaker = createTwitterCircuitBreaker(replyToTweetInternal);
export const replyToTweet = withRateLimit(
  (params: { tweetId: string; text: string; accessToken: string }) =>
    replyToTweetWithBreaker.fire(params),
  twitterUserRateLimiter
);

/**
 * Create a tweet using OAuth 2.0 token (internal)
 */
async function createTweetInternal(params: { text: string; accessToken: string }) {
  const { text, accessToken } = params;

  if (!accessToken) {
    throw new Error('Twitter access token is required. Please connect your Twitter account.');
  }

  const client = createTwitterClient(accessToken);

  logger.info({ textLength: text.length }, 'Creating tweet with OAuth');
  const tweet = await client.v2.tweet(text);
  logger.info({ tweetId: tweet.data.id }, 'Tweet created successfully');

  return tweet.data;
}

/**
 * Create a tweet (workflow-compatible)
 * Protected with circuit breaker + rate limiting
 */
const createTweetWithBreaker = createTwitterCircuitBreaker(createTweetInternal);
export const createTweet = withRateLimit(
  (params: { text: string; accessToken: string }) => createTweetWithBreaker.fire(params),
  twitterUserRateLimiter
);

// Alias for backwards compatibility
export const postTweet = createTweet;

/**
 * Create a thread using OAuth 2.0 token (internal)
 */
async function createThreadInternal(params: { tweets: string[]; accessToken: string }) {
  const { tweets, accessToken } = params;

  if (!accessToken) {
    throw new Error('Twitter access token is required. Please connect your Twitter account.');
  }

  if (!tweets || tweets.length === 0) {
    throw new Error('Cannot create thread: no tweets provided');
  }

  const client = createTwitterClient(accessToken);

  logger.info({ threadLength: tweets.length }, 'Creating tweet thread with OAuth');
  const results = await client.v2.tweetThread(tweets);
  const tweetIds = results.map(result => result.data.id);

  logger.info({ threadLength: tweetIds.length, tweetIds }, 'Thread created successfully');

  return tweetIds;
}

/**
 * Create a thread (workflow-compatible)
 * Protected with circuit breaker + rate limiting
 */
const createThreadWithBreaker = createTwitterCircuitBreaker(createThreadInternal);
export const createThread = withRateLimit(
  (params: { tweets: string[]; accessToken: string }) => createThreadWithBreaker.fire(params),
  twitterUserRateLimiter
);

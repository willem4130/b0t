import { WebClient } from '@slack/web-api';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Slack Module
 *
 * Send messages, files, and manage Slack workspaces
 * - Post to channels
 * - Send DMs
 * - Upload files
 * - Update messages
 * - React to messages
 * - Built-in resilience
 *
 * Perfect for:
 * - Workflow notifications
 * - Team alerts
 * - Status updates
 * - File sharing
 */

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!SLACK_BOT_TOKEN) {
  logger.warn('⚠️  SLACK_BOT_TOKEN not set. Slack features will not work.');
}

const slackClient = SLACK_BOT_TOKEN ? new WebClient(SLACK_BOT_TOKEN) : null;

// Rate limiter: Slack allows ~1 req/sec per workspace
const slackRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 1000, // 1 second
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000,
  id: 'slack',
});

export interface SlackMessageOptions {
  channel: string;
  text: string;
  blocks?: unknown[];
  threadTs?: string; // Reply in thread
  username?: string;
  iconEmoji?: string;
  iconUrl?: string;
}

export interface SlackMessageResponse {
  ts: string;
  channel: string;
}

/**
 * Internal post message function (unprotected)
 */
async function postMessageInternal(
  options: SlackMessageOptions
): Promise<SlackMessageResponse> {
  if (!slackClient) {
    throw new Error('Slack client not initialized. Set SLACK_BOT_TOKEN.');
  }

  logger.info(
    {
      channel: options.channel,
      textLength: options.text.length,
      hasBlocks: !!options.blocks,
    },
    'Posting Slack message'
  );

  const messageOptions: {
    channel: string;
    text: string;
    blocks?: never;
    thread_ts?: string;
    username?: string;
    icon_emoji?: string;
    icon_url?: string;
  } = {
    channel: options.channel,
    text: options.text,
  };

  if (options.blocks) messageOptions.blocks = options.blocks as never;
  if (options.threadTs) messageOptions.thread_ts = options.threadTs;
  if (options.username) messageOptions.username = options.username;
  if (options.iconEmoji) messageOptions.icon_emoji = options.iconEmoji;
  if (options.iconUrl) messageOptions.icon_url = options.iconUrl;

  const result = await slackClient.chat.postMessage(messageOptions as never);

  if (!result.ok) {
    throw new Error(`Slack message failed: ${result.error}`);
  }

  logger.info({ ts: result.ts, channel: result.channel }, 'Slack message posted');

  return {
    ts: result.ts as string,
    channel: result.channel as string,
  };
}

/**
 * Post message (protected)
 */
const postMessageWithBreaker = createCircuitBreaker(postMessageInternal, {
  timeout: 10000,
  name: 'slack-post-message',
});

const postMessageRateLimited = withRateLimit(
  async (options: SlackMessageOptions) => postMessageWithBreaker.fire(options),
  slackRateLimiter
);

export async function postMessage(
  options: SlackMessageOptions
): Promise<SlackMessageResponse> {
  return await postMessageRateLimited(options) as unknown as SlackMessageResponse;
}

/**
 * Send simple text message (convenience)
 */
export async function sendText(
  channel: string,
  text: string
): Promise<SlackMessageResponse> {
  return postMessage({ channel, text });
}

/**
 * Upload file
 */
export async function uploadFile(
  channel: string,
  file: Buffer | string,
  filename: string,
  title?: string
): Promise<{ fileId: string }> {
  if (!slackClient) {
    throw new Error('Slack client not initialized. Set SLACK_BOT_TOKEN.');
  }

  logger.info({ channel, filename }, 'Uploading file to Slack');

  const result = await slackClient.files.uploadV2({
    channel_id: channel,
    file,
    filename,
    title,
  });

  if (!result.ok || !(result as { file?: { id: string } }).file) {
    throw new Error(`Slack file upload failed: ${(result as { error?: string }).error}`);
  }

  const fileResult = result as unknown as { file: { id: string } };
  logger.info({ fileId: fileResult.file.id }, 'File uploaded to Slack');

  return { fileId: fileResult.file.id };
}

/**
 * React to message
 */
export async function addReaction(
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  if (!slackClient) {
    throw new Error('Slack client not initialized. Set SLACK_BOT_TOKEN.');
  }

  logger.info({ channel, timestamp, emoji }, 'Adding reaction');

  await slackClient.reactions.add({
    channel,
    timestamp,
    name: emoji,
  });

  logger.info('Reaction added');
}

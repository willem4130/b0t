import { Telegraf } from 'telegraf';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Telegram Module
 *
 * Send messages, photos, and manage Telegram bots
 * - Send text messages
 * - Send photos and files
 * - Send to channels and groups
 * - Edit messages
 * - Built-in resilience
 *
 * Perfect for:
 * - Instant notifications
 * - Bot responses
 * - Channel broadcasts
 * - Customer support automation
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  logger.warn('⚠️  TELEGRAM_BOT_TOKEN not set. Telegram features will not work.');
}

const telegramBot = TELEGRAM_BOT_TOKEN ? new Telegraf(TELEGRAM_BOT_TOKEN) : null;

// Rate limiter: Telegram allows ~30 messages/sec
const telegramRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // 100ms between requests
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 1000,
  id: 'telegram',
});

export interface TelegramMessageOptions {
  chatId: string | number;
  text: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
  replyToMessageId?: number;
}

export interface TelegramMessageResponse {
  messageId: number;
  chatId: number;
}

/**
 * Internal send message function (unprotected)
 */
async function sendMessageInternal(
  options: TelegramMessageOptions
): Promise<TelegramMessageResponse> {
  if (!telegramBot) {
    throw new Error('Telegram bot not initialized. Set TELEGRAM_BOT_TOKEN.');
  }

  logger.info(
    {
      chatId: options.chatId,
      textLength: options.text.length,
      parseMode: options.parseMode,
    },
    'Sending Telegram message'
  );

  const message = await telegramBot.telegram.sendMessage(
    options.chatId,
    options.text,
    {
      parse_mode: options.parseMode,
      link_preview_options: options.disableWebPagePreview
        ? { is_disabled: true }
        : undefined,
      disable_notification: options.disableNotification,
      reply_parameters: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }
  );

  logger.info(
    { messageId: message.message_id, chatId: message.chat.id },
    'Telegram message sent'
  );

  return {
    messageId: message.message_id,
    chatId: message.chat.id,
  };
}

/**
 * Send message (protected)
 */
const sendMessageWithBreaker = createCircuitBreaker(sendMessageInternal, {
  timeout: 10000,
  name: 'telegram-send-message',
});

const sendMessageRateLimited = withRateLimit(
  async (options: TelegramMessageOptions) => sendMessageWithBreaker.fire(options),
  telegramRateLimiter
);

export async function sendMessage(
  options: TelegramMessageOptions
): Promise<TelegramMessageResponse> {
  return (await sendMessageRateLimited(options)) as unknown as TelegramMessageResponse;
}

/**
 * Send simple text message (convenience)
 */
export async function sendText(
  chatId: string | number,
  text: string
): Promise<TelegramMessageResponse> {
  return sendMessage({ chatId, text });
}

/**
 * Send markdown message (convenience)
 */
export async function sendMarkdown(
  chatId: string | number,
  text: string
): Promise<TelegramMessageResponse> {
  return sendMessage({ chatId, text, parseMode: 'Markdown' });
}

/**
 * Send HTML message (convenience)
 */
export async function sendHtml(
  chatId: string | number,
  text: string
): Promise<TelegramMessageResponse> {
  return sendMessage({ chatId, text, parseMode: 'HTML' });
}

/**
 * Send photo
 */
export async function sendPhoto(
  chatId: string | number,
  photo: string | Buffer,
  caption?: string,
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
): Promise<TelegramMessageResponse> {
  if (!telegramBot) {
    throw new Error('Telegram bot not initialized. Set TELEGRAM_BOT_TOKEN.');
  }

  logger.info({ chatId, hasCaption: !!caption }, 'Sending Telegram photo');

  const message = await telegramBot.telegram.sendPhoto(
    chatId,
    { source: photo as Buffer },
    {
      caption,
      parse_mode: parseMode,
    }
  );

  logger.info(
    { messageId: message.message_id, chatId: message.chat.id },
    'Telegram photo sent'
  );

  return {
    messageId: message.message_id,
    chatId: message.chat.id,
  };
}

/**
 * Send document/file
 */
export async function sendDocument(
  chatId: string | number,
  document: string | Buffer,
  filename?: string,
  caption?: string
): Promise<TelegramMessageResponse> {
  if (!telegramBot) {
    throw new Error('Telegram bot not initialized. Set TELEGRAM_BOT_TOKEN.');
  }

  logger.info({ chatId, filename }, 'Sending Telegram document');

  const message = await telegramBot.telegram.sendDocument(
    chatId,
    { source: document as Buffer, filename: filename || 'file' },
    {
      caption,
    }
  );

  logger.info(
    { messageId: message.message_id, chatId: message.chat.id },
    'Telegram document sent'
  );

  return {
    messageId: message.message_id,
    chatId: message.chat.id,
  };
}

/**
 * Edit message text
 */
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
): Promise<void> {
  if (!telegramBot) {
    throw new Error('Telegram bot not initialized. Set TELEGRAM_BOT_TOKEN.');
  }

  logger.info({ chatId, messageId }, 'Editing Telegram message');

  await telegramBot.telegram.editMessageText(chatId, messageId, undefined, text, {
    parse_mode: parseMode,
  });

  logger.info('Telegram message edited');
}

/**
 * Delete message
 */
export async function deleteMessage(
  chatId: string | number,
  messageId: number
): Promise<void> {
  if (!telegramBot) {
    throw new Error('Telegram bot not initialized. Set TELEGRAM_BOT_TOKEN.');
  }

  logger.info({ chatId, messageId }, 'Deleting Telegram message');

  await telegramBot.telegram.deleteMessage(chatId, messageId);

  logger.info('Telegram message deleted');
}

/**
 * Send to channel (convenience for broadcasting)
 */
export async function sendToChannel(
  channelUsername: string,
  text: string,
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
): Promise<TelegramMessageResponse> {
  return sendMessage({
    chatId: `@${channelUsername}`,
    text,
    parseMode,
  });
}

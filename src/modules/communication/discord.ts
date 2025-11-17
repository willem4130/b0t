import { Client, GatewayIntentBits, TextChannel, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Discord Module
 *
 * Send messages, embeds, and manage Discord servers
 * - Post to channels
 * - Send embeds with rich formatting
 * - Send files and attachments
 * - React to messages
 * - Built-in resilience
 *
 * Perfect for:
 * - Gaming community notifications
 * - Bot commands and responses
 * - Status updates
 * - Community engagement
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
  logger.warn('⚠️  DISCORD_BOT_TOKEN not set. Discord features will not work.');
}

let discordClient: Client | null = null;

// Initialize Discord client
if (DISCORD_BOT_TOKEN) {
  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  discordClient.login(DISCORD_BOT_TOKEN).catch((error) => {
    logger.error({ error }, 'Failed to login to Discord');
  });

  discordClient.once('ready', () => {
    logger.info({ username: discordClient?.user?.tag }, 'Discord bot ready');
  });
}

// Rate limiter: Discord allows ~50 req/sec per bot
const discordRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // 100ms between requests = ~10/sec
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 1000,
  id: 'discord',
});

export interface DiscordMessageOptions {
  channelId: string;
  content?: string;
  embeds?: {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
    timestamp?: boolean;
  }[];
}

export interface DiscordMessageResponse {
  messageId: string;
  channelId: string;
}

/**
 * Internal send message function (unprotected)
 */
async function sendMessageInternal(
  options: DiscordMessageOptions
): Promise<DiscordMessageResponse> {
  if (!discordClient || !discordClient.isReady()) {
    throw new Error('Discord client not initialized or not ready.');
  }

  logger.info(
    {
      channelId: options.channelId,
      hasContent: !!options.content,
      embedCount: options.embeds?.length || 0,
    },
    'Sending Discord message'
  );

  const channel = await discordClient.channels.fetch(options.channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel ${options.channelId} not found or not a text channel`);
  }

  const embeds = options.embeds?.map((embed) => {
    const builder = new EmbedBuilder();
    if (embed.title) builder.setTitle(embed.title);
    if (embed.description) builder.setDescription(embed.description);
    if (embed.color) builder.setColor(embed.color);
    if (embed.fields) builder.addFields(embed.fields);
    if (embed.footer) builder.setFooter(embed.footer);
    if (embed.timestamp) builder.setTimestamp();
    return builder;
  });

  const message = await channel.send({
    content: options.content,
    embeds: embeds,
  });

  logger.info(
    { messageId: message.id, channelId: message.channelId },
    'Discord message sent'
  );

  return {
    messageId: message.id,
    channelId: message.channelId,
  };
}

/**
 * Send message (protected)
 */
const sendMessageWithBreaker = createCircuitBreaker(sendMessageInternal, {
  timeout: 10000,
  name: 'discord-send-message',
});

const sendMessageRateLimited = withRateLimit(
  async (options: DiscordMessageOptions) => sendMessageWithBreaker.fire(options),
  discordRateLimiter
);

export async function sendMessage(
  options: DiscordMessageOptions
): Promise<DiscordMessageResponse> {
  return (await sendMessageRateLimited(options)) as unknown as DiscordMessageResponse;
}

/**
 * Send simple text message (convenience)
 */
export async function sendText(
  channelId: string,
  content: string
): Promise<DiscordMessageResponse> {
  return sendMessage({ channelId, content });
}

/**
 * Send embed message (convenience)
 */
export async function sendEmbed(
  channelId: string,
  embed: {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
    timestamp?: boolean;
  }
): Promise<DiscordMessageResponse> {
  return sendMessage({ channelId, embeds: [embed] });
}

/**
 * Send file attachment
 */
export async function sendFile(
  channelId: string,
  file: Buffer | string,
  filename: string,
  content?: string
): Promise<DiscordMessageResponse> {
  if (!discordClient || !discordClient.isReady()) {
    throw new Error('Discord client not initialized or not ready.');
  }

  logger.info({ channelId, filename }, 'Sending Discord file');

  const channel = await discordClient.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel ${channelId} not found or not a text channel`);
  }

  const attachment = new AttachmentBuilder(file, { name: filename });

  const message = await channel.send({
    content,
    files: [attachment],
  });

  logger.info({ messageId: message.id, channelId: message.channelId }, 'Discord file sent');

  return {
    messageId: message.id,
    channelId: message.channelId,
  };
}

/**
 * Add reaction to message
 */
export async function addReaction(
  channelId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  if (!discordClient || !discordClient.isReady()) {
    throw new Error('Discord client not initialized or not ready.');
  }

  logger.info({ channelId, messageId, emoji }, 'Adding Discord reaction');

  const channel = await discordClient.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel ${channelId} not found or not a text channel`);
  }

  const message = await channel.messages.fetch(messageId);
  await message.react(emoji);

  logger.info('Discord reaction added');
}

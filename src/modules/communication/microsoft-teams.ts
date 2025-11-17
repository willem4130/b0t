import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Microsoft Teams Module
 *
 * Send messages, manage channels, and collaborate via Microsoft Teams
 * - Send messages to channels
 * - Send direct messages to users
 * - Create and manage channels
 * - Upload files to channels
 * - Schedule messages
 * - React to messages
 * - Retrieve channel messages
 * - Built-in resilience and rate limiting
 *
 * Perfect for:
 * - Enterprise collaboration
 * - Team notifications
 * - Workflow automation
 * - File sharing
 * - Meeting coordination
 */

const TEAMS_CLIENT_ID = process.env.TEAMS_CLIENT_ID;
const TEAMS_CLIENT_SECRET = process.env.TEAMS_CLIENT_SECRET;
const TEAMS_TENANT_ID = process.env.TEAMS_TENANT_ID;

if (!TEAMS_CLIENT_ID || !TEAMS_CLIENT_SECRET || !TEAMS_TENANT_ID) {
  logger.warn(
    '⚠️  TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, or TEAMS_TENANT_ID not set. Microsoft Teams features will not work.'
  );
}

let graphClient: Client | null = null;

// Initialize Microsoft Graph client with app-only authentication
if (TEAMS_CLIENT_ID && TEAMS_CLIENT_SECRET && TEAMS_TENANT_ID) {
  try {
    const credential = new ClientSecretCredential(
      TEAMS_TENANT_ID,
      TEAMS_CLIENT_ID,
      TEAMS_CLIENT_SECRET
    );

    graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken('https://graph.microsoft.com/.default');
          return token?.token || '';
        },
      },
    });

    logger.info('Microsoft Teams Graph client initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Microsoft Teams Graph client');
  }
}

// Rate limiter: Microsoft Graph API allows ~5 requests/second per app
const teamsRateLimiter = createRateLimiter({
  maxConcurrent: 3,
  minTime: 200, // 200ms between requests = ~5/sec
  reservoir: 300,
  reservoirRefreshAmount: 300,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'microsoft-teams',
});

export interface TeamsMessageOptions {
  teamId: string;
  channelId: string;
  content: string;
  contentType?: 'text' | 'html';
  subject?: string;
  attachments?: Array<{
    id: string;
    contentType: string;
    contentUrl?: string;
    content?: string;
    name?: string;
  }>;
}

export interface TeamsMessageResponse {
  messageId: string;
  createdDateTime: string;
  webUrl?: string;
}

/**
 * Internal send message function (unprotected)
 */
async function sendMessageInternal(
  options: TeamsMessageOptions
): Promise<TeamsMessageResponse> {
  if (!graphClient) {
    throw new Error(
      'Microsoft Teams client not initialized. Set TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, and TEAMS_TENANT_ID.'
    );
  }

  logger.info(
    {
      teamId: options.teamId,
      channelId: options.channelId,
      contentLength: options.content.length,
      hasAttachments: !!options.attachments?.length,
    },
    'Sending Teams message'
  );

  const chatMessage: {
    body: {
      contentType: string;
      content: string;
    };
    subject?: string;
    attachments?: Array<{
      id: string;
      contentType: string;
      contentUrl?: string;
      content?: string;
      name?: string;
    }>;
  } = {
    body: {
      contentType: options.contentType || 'text',
      content: options.content,
    },
  };

  if (options.subject) {
    chatMessage.subject = options.subject;
  }

  if (options.attachments) {
    chatMessage.attachments = options.attachments;
  }

  const result = await graphClient
    .api(`/teams/${options.teamId}/channels/${options.channelId}/messages`)
    .post(chatMessage);

  logger.info(
    { messageId: result.id, createdDateTime: result.createdDateTime },
    'Teams message sent'
  );

  return {
    messageId: result.id,
    createdDateTime: result.createdDateTime,
    webUrl: result.webUrl,
  };
}

const sendMessageWithBreaker = createCircuitBreaker(sendMessageInternal, {
  timeout: 15000,
  name: 'teams-send-message',
});

const sendMessageRateLimited = withRateLimit(
  async (options: TeamsMessageOptions) => sendMessageWithBreaker.fire(options),
  teamsRateLimiter
);

export async function sendMessage(
  options: TeamsMessageOptions
): Promise<TeamsMessageResponse> {
  return (await sendMessageRateLimited(options)) as unknown as TeamsMessageResponse;
}

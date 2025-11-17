/* eslint-disable */
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * WhatsApp Business API Module
 *
 * Send messages via WhatsApp Business Platform
 * - Send text messages
 * - Send media (images, videos, documents)
 * - Send template messages
 * - Get message status
 * - Send interactive messages
 * - Mark messages as read
 * - Built-in resilience
 *
 * Perfect for:
 * - Customer notifications
 * - Order confirmations
 * - Support conversations
 * - Marketing messages
 * - Transactional updates
 */

const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';

if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  logger.warn('⚠️  WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set. WhatsApp features will not work.');
}

const whatsappApiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Rate limiter: WhatsApp Business API has generous limits
const whatsappRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 100, // 100ms between requests
  reservoir: 1000,
  reservoirRefreshAmount: 1000,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'whatsapp-business',
});

export interface SendMessageOptions {
  to: string; // Phone number in international format (e.g., 15551234567)
  body: string;
  previewUrl?: boolean; // Preview URLs in message
}

export interface MessageResponse {
  messagingProduct: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

/**
 * Send text message
 */
async function sendMessageInternal(options: SendMessageOptions): Promise<MessageResponse> {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials not set. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  logger.info(
    {
      to: options.to,
      bodyLength: options.body.length,
    },
    'Sending WhatsApp message'
  );

  const response = await axios.post(
    whatsappApiUrl,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to,
      type: 'text',
      text: {
        preview_url: options.previewUrl || false,
        body: options.body,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ messageId: response.data.messages[0].id }, 'WhatsApp message sent');

  return {
    messagingProduct: response.data.messaging_product,
    contacts: response.data.contacts,
    messages: response.data.messages,
  };
}

const sendMessageWithBreaker = createCircuitBreaker(sendMessageInternal, {
  timeout: 10000,
  name: 'whatsapp-send-message',
});

const sendMessageRateLimited = withRateLimit(
  async (options: SendMessageOptions) => sendMessageWithBreaker.fire(options),
  whatsappRateLimiter
);

export async function sendMessage(options: SendMessageOptions): Promise<MessageResponse> {
  return await sendMessageRateLimited(options) as unknown as MessageResponse;
}

export interface SendMediaOptions {
  to: string;
  type: 'image' | 'video' | 'document' | 'audio';
  mediaUrl?: string; // URL or media ID
  mediaId?: string;
  caption?: string; // For image/video
  filename?: string; // For document
}

/**
 * Send media message (image, video, document, audio)
 */
async function sendMediaInternal(options: SendMediaOptions): Promise<MessageResponse> {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials not set. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  if (!options.mediaUrl && !options.mediaId) {
    throw new Error('Either mediaUrl or mediaId must be provided');
  }

  logger.info(
    {
      to: options.to,
      type: options.type,
      hasUrl: !!options.mediaUrl,
      hasId: !!options.mediaId,
    },
    'Sending WhatsApp media message'
  );

  const mediaObject: Record<string, string> = {};

  if (options.mediaId) {
    mediaObject.id = options.mediaId;
  } else if (options.mediaUrl) {
    mediaObject.link = options.mediaUrl;
  }

  if (options.caption && (options.type === 'image' || options.type === 'video')) {
    mediaObject.caption = options.caption;
  }

  if (options.filename && options.type === 'document') {
    mediaObject.filename = options.filename;
  }

  const response = await axios.post(
    whatsappApiUrl,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to,
      type: options.type,
      [options.type]: mediaObject,
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ messageId: response.data.messages[0].id }, 'WhatsApp media message sent');

  return {
    messagingProduct: response.data.messaging_product,
    contacts: response.data.contacts,
    messages: response.data.messages,
  };
}

const sendMediaWithBreaker = createCircuitBreaker(sendMediaInternal, {
  timeout: 15000,
  name: 'whatsapp-send-media',
});

const sendMediaRateLimited = withRateLimit(
  async (options: SendMediaOptions) => sendMediaWithBreaker.fire(options),
  whatsappRateLimiter
);

export async function sendMedia(options: SendMediaOptions): Promise<MessageResponse> {
  return await sendMediaRateLimited(options) as unknown as MessageResponse;
}

export interface SendTemplateOptions {
  to: string;
  templateName: string;
  languageCode: string; // e.g., 'en_US', 'es_MX'
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters: Array<{
      type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
      text?: string;
      currency?: { fallback_value: string; code: string; amount_1000: number };
      date_time?: { fallback_value: string };
      image?: { link: string };
      document?: { link: string; filename?: string };
      video?: { link: string };
    }>;
  }>;
}

/**
 * Send template message (pre-approved templates)
 */
async function sendTemplateInternal(options: SendTemplateOptions): Promise<MessageResponse> {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials not set. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  logger.info(
    {
      to: options.to,
      templateName: options.templateName,
      languageCode: options.languageCode,
    },
    'Sending WhatsApp template message'
  );

  const response = await axios.post(
    whatsappApiUrl,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to,
      type: 'template',
      template: {
        name: options.templateName,
        language: {
          code: options.languageCode,
        },
        components: options.components,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ messageId: response.data.messages[0].id }, 'WhatsApp template message sent');

  return {
    messagingProduct: response.data.messaging_product,
    contacts: response.data.contacts,
    messages: response.data.messages,
  };
}

const sendTemplateWithBreaker = createCircuitBreaker(sendTemplateInternal, {
  timeout: 10000,
  name: 'whatsapp-send-template',
});

const sendTemplateRateLimited = withRateLimit(
  async (options: SendTemplateOptions) => sendTemplateWithBreaker.fire(options),
  whatsappRateLimiter
);

export async function sendTemplate(options: SendTemplateOptions): Promise<MessageResponse> {
  return await sendTemplateRateLimited(options) as unknown as MessageResponse;
}

export interface MessageStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

/**
 * Get message status (via webhook - this is a placeholder for webhook data structure)
 * In practice, WhatsApp sends status updates via webhooks, not polling
 */
export interface GetMessageStatusOptions {
  messageId: string;
}

export async function getMessageStatus(messageId: string): Promise<{ messageId: string; note: string }> {
  logger.info({ messageId }, 'WhatsApp message status is delivered via webhooks');

  return {
    messageId,
    note: 'WhatsApp delivers message status updates via webhooks. Configure your webhook endpoint to receive status updates.',
  };
}

export interface MarkAsReadOptions {
  messageId: string;
}

/**
 * Mark message as read
 */
async function markAsReadInternal(messageId: string): Promise<{ success: boolean }> {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials not set. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  logger.info({ messageId }, 'Marking WhatsApp message as read');

  await axios.post(
    whatsappApiUrl,
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ messageId }, 'WhatsApp message marked as read');

  return { success: true };
}

const markAsReadWithBreaker = createCircuitBreaker(markAsReadInternal, {
  timeout: 10000,
  name: 'whatsapp-mark-as-read',
});

const markAsReadRateLimited = withRateLimit(
  async (messageId: string) => markAsReadWithBreaker.fire(messageId),
  whatsappRateLimiter
);

export async function markAsRead(messageId: string): Promise<{ success: boolean }> {
  return await markAsReadRateLimited(messageId) as unknown as { success: boolean };
}

export interface SendLocationOptions {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Send location message
 */
async function sendLocationInternal(options: SendLocationOptions): Promise<MessageResponse> {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials not set. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  logger.info(
    {
      to: options.to,
      latitude: options.latitude,
      longitude: options.longitude,
    },
    'Sending WhatsApp location message'
  );

  const response = await axios.post(
    whatsappApiUrl,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to,
      type: 'location',
      location: {
        latitude: options.latitude,
        longitude: options.longitude,
        name: options.name,
        address: options.address,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ messageId: response.data.messages[0].id }, 'WhatsApp location message sent');

  return {
    messagingProduct: response.data.messaging_product,
    contacts: response.data.contacts,
    messages: response.data.messages,
  };
}

const sendLocationWithBreaker = createCircuitBreaker(sendLocationInternal, {
  timeout: 10000,
  name: 'whatsapp-send-location',
});

const sendLocationRateLimited = withRateLimit(
  async (options: SendLocationOptions) => sendLocationWithBreaker.fire(options),
  whatsappRateLimiter
);

export async function sendLocation(options: SendLocationOptions): Promise<MessageResponse> {
  return await sendLocationRateLimited(options) as unknown as MessageResponse;
}

export interface SendContactOptions {
  to: string;
  contacts: Array<{
    name: {
      formatted_name: string;
      first_name?: string;
      last_name?: string;
    };
    phones?: Array<{
      phone: string;
      type?: string;
    }>;
    emails?: Array<{
      email: string;
      type?: string;
    }>;
  }>;
}

/**
 * Send contact card
 */
async function sendContactInternal(options: SendContactOptions): Promise<MessageResponse> {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials not set. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  logger.info(
    {
      to: options.to,
      contactCount: options.contacts.length,
    },
    'Sending WhatsApp contact message'
  );

  const response = await axios.post(
    whatsappApiUrl,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to,
      type: 'contacts',
      contacts: options.contacts,
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ messageId: response.data.messages[0].id }, 'WhatsApp contact message sent');

  return {
    messagingProduct: response.data.messaging_product,
    contacts: response.data.contacts,
    messages: response.data.messages,
  };
}

const sendContactWithBreaker = createCircuitBreaker(sendContactInternal, {
  timeout: 10000,
  name: 'whatsapp-send-contact',
});

const sendContactRateLimited = withRateLimit(
  async (options: SendContactOptions) => sendContactWithBreaker.fire(options),
  whatsappRateLimiter
);

export async function sendContact(options: SendContactOptions): Promise<MessageResponse> {
  return await sendContactRateLimited(options) as unknown as MessageResponse;
}

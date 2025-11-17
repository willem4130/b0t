import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Intercom Module
 *
 * Customer messaging and engagement platform
 * - Send messages to users
 * - Create and manage contacts
 * - Get contact details
 * - Add tags to contacts
 * - Get conversations
 * - Track user events
 * - Built-in resilience
 *
 * Perfect for:
 * - Customer communication
 * - In-app messaging
 * - User engagement
 * - Support conversations
 * - Marketing automation
 */

const INTERCOM_ACCESS_TOKEN = process.env.INTERCOM_ACCESS_TOKEN;
const INTERCOM_API_VERSION = process.env.INTERCOM_API_VERSION || '2.11';

if (!INTERCOM_ACCESS_TOKEN) {
  logger.warn('⚠️  INTERCOM_ACCESS_TOKEN not set. Intercom features will not work.');
}

const intercomApiUrl = 'https://api.intercom.io';

// Rate limiter: Intercom has different rate limits by plan
const intercomRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100,
  reservoir: 500,
  reservoirRefreshAmount: 500,
  reservoirRefreshInterval: 60 * 1000,
  id: 'intercom',
});

function getAuthHeaders(): Record<string, string> {
  if (!INTERCOM_ACCESS_TOKEN) {
    throw new Error('Intercom access token not set');
  }
  return {
    Authorization: `Bearer ${INTERCOM_ACCESS_TOKEN}`,
    'Intercom-Version': INTERCOM_API_VERSION,
    'Content-Type': 'application/json',
  };
}

export interface SendMessageOptions {
  userId?: string;
  email?: string;
  messageType: 'inapp' | 'email' | 'push';
  subject?: string;
  body: string;
  from?: {
    type: 'admin' | 'bot';
    id?: string;
  };
}

export interface Message {
  id: string;
  type: string;
  body: string;
  subject?: string;
  messageType: string;
  createdAt: number;
  conversationId: string;
}

async function sendMessageInternal(options: SendMessageOptions): Promise<Message> {
  if (!INTERCOM_ACCESS_TOKEN) {
    throw new Error('Intercom not configured. Set INTERCOM_ACCESS_TOKEN.');
  }

  if (!options.userId && !options.email) {
    throw new Error('Either userId or email must be provided');
  }

  logger.info(
    {
      userId: options.userId,
      email: options.email,
      messageType: options.messageType,
    },
    'Sending Intercom message'
  );

  const messageData: Record<string, unknown> = {
    message_type: options.messageType,
    body: options.body,
  };

  if (options.subject) {
    messageData.subject = options.subject;
  }

  if (options.from) {
    messageData.from = options.from;
  }

  if (options.userId) {
    messageData.to = {
      type: 'user',
      user_id: options.userId,
    };
  } else if (options.email) {
    messageData.to = {
      type: 'user',
      email: options.email,
    };
  }

  const response = await axios.post(`${intercomApiUrl}/messages`, messageData, {
    headers: getAuthHeaders(),
  });

  logger.info({ messageId: response.data.id }, 'Intercom message sent');

  return {
    id: response.data.id,
    type: response.data.type,
    body: response.data.body,
    subject: response.data.subject,
    messageType: response.data.message_type,
    createdAt: response.data.created_at,
    conversationId: response.data.conversation_id,
  };
}

const sendMessageWithBreaker = createCircuitBreaker(sendMessageInternal, {
  timeout: 15000,
  name: 'intercom-send-message',
});

const sendMessageRateLimited = withRateLimit(
  async (options: SendMessageOptions) => sendMessageWithBreaker.fire(options),
  intercomRateLimiter
);

export async function sendMessage(options: SendMessageOptions): Promise<Message> {
  return await sendMessageRateLimited(options) as unknown as Message;
}

export interface CreateContactOptions {
  email?: string;
  userId?: string;
  phone?: string;
  name?: string;
  avatar?: string;
  signedUpAt?: number;
  lastSeenAt?: number;
  customAttributes?: Record<string, string | number | boolean>;
}

export interface Contact {
  id: string;
  type: string;
  externalId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatar: string | null;
  signedUpAt: number | null;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
  customAttributes: Record<string, string | number | boolean>;
}

async function createContactInternal(options: CreateContactOptions): Promise<Contact> {
  if (!INTERCOM_ACCESS_TOKEN) {
    throw new Error('Intercom not configured. Set INTERCOM_ACCESS_TOKEN.');
  }

  logger.info({ email: options.email, userId: options.userId }, 'Creating Intercom contact');

  const contactData: Record<string, unknown> = {
    role: 'user',
  };

  if (options.email) contactData.email = options.email;
  if (options.userId) contactData.external_id = options.userId;
  if (options.phone) contactData.phone = options.phone;
  if (options.name) contactData.name = options.name;
  if (options.avatar) contactData.avatar = options.avatar;
  if (options.signedUpAt) contactData.signed_up_at = options.signedUpAt;
  if (options.lastSeenAt) contactData.last_seen_at = options.lastSeenAt;
  if (options.customAttributes) contactData.custom_attributes = options.customAttributes;

  const response = await axios.post(`${intercomApiUrl}/contacts`, contactData, {
    headers: getAuthHeaders(),
  });

  logger.info({ contactId: response.data.id }, 'Intercom contact created');

  return {
    id: response.data.id,
    type: response.data.type,
    externalId: response.data.external_id,
    email: response.data.email,
    phone: response.data.phone,
    name: response.data.name,
    avatar: response.data.avatar,
    signedUpAt: response.data.signed_up_at,
    lastSeenAt: response.data.last_seen_at,
    createdAt: response.data.created_at,
    updatedAt: response.data.updated_at,
    customAttributes: response.data.custom_attributes || {},
  };
}

const createContactWithBreaker = createCircuitBreaker(createContactInternal, {
  timeout: 15000,
  name: 'intercom-create-contact',
});

const createContactRateLimited = withRateLimit(
  async (options: CreateContactOptions) => createContactWithBreaker.fire(options),
  intercomRateLimiter
);

export async function createContact(options: CreateContactOptions): Promise<Contact> {
  return await createContactRateLimited(options) as unknown as Contact;
}

export interface GetContactOptions {
  contactId: string;
}

async function getContactInternal(contactId: string): Promise<Contact> {
  if (!INTERCOM_ACCESS_TOKEN) {
    throw new Error('Intercom not configured. Set INTERCOM_ACCESS_TOKEN.');
  }

  logger.info({ contactId }, 'Fetching Intercom contact');

  const response = await axios.get(`${intercomApiUrl}/contacts/${contactId}`, {
    headers: getAuthHeaders(),
  });

  const contact = response.data;

  logger.info({ contactId: contact.id }, 'Intercom contact retrieved');

  return {
    id: contact.id,
    type: contact.type,
    externalId: contact.external_id,
    email: contact.email,
    phone: contact.phone,
    name: contact.name,
    avatar: contact.avatar,
    signedUpAt: contact.signed_up_at,
    lastSeenAt: contact.last_seen_at,
    createdAt: contact.created_at,
    updatedAt: contact.updated_at,
    customAttributes: contact.custom_attributes || {},
  };
}

const getContactWithBreaker = createCircuitBreaker(getContactInternal, {
  timeout: 15000,
  name: 'intercom-get-contact',
});

const getContactRateLimited = withRateLimit(
  async (contactId: string) => getContactWithBreaker.fire(contactId),
  intercomRateLimiter
);

export async function getContact(contactId: string): Promise<Contact> {
  return await getContactRateLimited(contactId) as unknown as Contact;
}

export interface AddTagOptions {
  contactId: string;
  tagName: string;
}

async function addTagInternal(options: AddTagOptions): Promise<{ success: boolean }> {
  if (!INTERCOM_ACCESS_TOKEN) {
    throw new Error('Intercom not configured. Set INTERCOM_ACCESS_TOKEN.');
  }

  logger.info({ contactId: options.contactId, tagName: options.tagName }, 'Adding Intercom tag');

  await axios.post(
    `${intercomApiUrl}/contacts/${options.contactId}/tags`,
    {
      id: options.tagName,
    },
    {
      headers: getAuthHeaders(),
    }
  );

  logger.info({ contactId: options.contactId, tagName: options.tagName }, 'Intercom tag added');

  return { success: true };
}

const addTagWithBreaker = createCircuitBreaker(addTagInternal, {
  timeout: 10000,
  name: 'intercom-add-tag',
});

const addTagRateLimited = withRateLimit(
  async (options: AddTagOptions) => addTagWithBreaker.fire(options),
  intercomRateLimiter
);

export async function addTag(contactId: string, tagName: string): Promise<{ success: boolean }> {
  return await addTagRateLimited({ contactId, tagName }) as unknown as { success: boolean };
}

export interface Conversation {
  id: string;
  type: string;
  createdAt: number;
  updatedAt: number;
  open: boolean;
  state: string;
  read: boolean;
}

async function getConversationsInternal(userId: string): Promise<{ conversations: Conversation[] }> {
  if (!INTERCOM_ACCESS_TOKEN) {
    throw new Error('Intercom not configured. Set INTERCOM_ACCESS_TOKEN.');
  }

  logger.info({ userId }, 'Fetching Intercom conversations');

  const response = await axios.post(
    `${intercomApiUrl}/conversations/search`,
    {
      query: {
        field: 'contact_ids',
        operator: '=',
        value: userId,
      },
    },
    {
      headers: getAuthHeaders(),
    }
  );

  logger.info({ count: response.data.conversations?.length || 0 }, 'Intercom conversations retrieved');

  return {
    conversations: response.data.conversations || [],
  };
}

const getConversationsWithBreaker = createCircuitBreaker(getConversationsInternal, {
  timeout: 15000,
  name: 'intercom-get-conversations',
});

const getConversationsRateLimited = withRateLimit(
  async (userId: string) => getConversationsWithBreaker.fire(userId),
  intercomRateLimiter
);

export async function getConversations(userId: string): Promise<{ conversations: Conversation[] }> {
  return await getConversationsRateLimited(userId) as unknown as { conversations: Conversation[] };
}

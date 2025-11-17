/* eslint-disable */
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Firebase Cloud Messaging (FCM) Module
 *
 * Send push notifications via Firebase
 * - Send notification to device token
 * - Send to topic subscribers
 * - Send to device groups
 * - Send data messages
 * - Schedule notifications
 * - Manage topic subscriptions
 * - Built-in resilience
 *
 * Perfect for:
 * - Mobile app notifications
 * - Cross-platform messaging
 * - Topic-based broadcasts
 * - Data synchronization
 * - Real-time updates
 */

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;
const FCM_PROJECT_ID = process.env.FCM_PROJECT_ID;
const FCM_SENDER_ID = process.env.FCM_SENDER_ID;

if (!FCM_SERVER_KEY) {
  logger.warn('⚠️  FCM_SERVER_KEY not set. Firebase Cloud Messaging features will not work.');
}

const fcmApiUrl = 'https://fcm.googleapis.com/fcm/send';

// Rate limiter: FCM has generous limits
const fcmRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 50, // 50ms between requests
  reservoir: 600,
  reservoirRefreshAmount: 600,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'firebase-fcm',
});

export interface SendNotificationOptions {
  // Target (choose one)
  token?: string; // Single device token
  tokens?: string[]; // Multiple device tokens (max 1000)
  topic?: string; // Topic name
  condition?: string; // Boolean condition for topics

  // Notification payload (displays system notification)
  notification?: {
    title: string;
    body: string;
    image?: string;
    icon?: string;
    sound?: string;
    badge?: string;
    tag?: string;
    color?: string;
    clickAction?: string;
  };

  // Data payload (custom key-value pairs)
  data?: Record<string, string>;

  // Android-specific
  android?: {
    priority?: 'normal' | 'high';
    ttl?: string; // Time to live (e.g., '86400s')
    collapseKey?: string;
    restrictedPackageName?: string;
    notification?: {
      title?: string;
      body?: string;
      icon?: string;
      color?: string;
      sound?: string;
      tag?: string;
      clickAction?: string;
      channelId?: string;
    };
  };

  // iOS-specific (APNs)
  apns?: {
    headers?: {
      'apns-priority'?: '5' | '10';
      'apns-expiration'?: string;
      'apns-topic'?: string;
      'apns-collapse-id'?: string;
    };
    payload?: {
      aps?: {
        alert?: {
          title?: string;
          body?: string;
          subtitle?: string;
        };
        badge?: number;
        sound?: string;
        'content-available'?: 0 | 1;
        'mutable-content'?: 0 | 1;
        category?: string;
      };
    };
  };

  // Web-specific
  webpush?: {
    headers?: {
      TTL?: string;
      Urgency?: 'very-low' | 'low' | 'normal' | 'high';
    };
    notification?: {
      title?: string;
      body?: string;
      icon?: string;
      badge?: string;
      image?: string;
      data?: Record<string, string>;
      actions?: Array<{
        action: string;
        title: string;
        icon?: string;
      }>;
    };
  };

  // General options
  priority?: 'normal' | 'high';
  contentAvailable?: boolean;
  mutableContent?: boolean;
  timeToLive?: number; // In seconds
  dryRun?: boolean; // Test without sending
}

export interface NotificationResponse {
  messageId?: string;
  multicastId?: number;
  success: number;
  failure: number;
  canonicalIds?: number;
  results?: Array<{
    messageId?: string;
    registrationId?: string;
    error?: string;
  }>;
}

/**
 * Send push notification via FCM
 */
async function sendNotificationInternal(options: SendNotificationOptions): Promise<NotificationResponse> {
  if (!FCM_SERVER_KEY) {
    throw new Error('FCM credentials not set. Set FCM_SERVER_KEY.');
  }

  if (!options.token && !options.tokens && !options.topic && !options.condition) {
    throw new Error('Must specify target: token, tokens, topic, or condition');
  }

  logger.info(
    {
      hasToken: !!options.token,
      tokenCount: options.tokens?.length,
      topic: options.topic,
      hasCondition: !!options.condition,
    },
    'Sending FCM notification'
  );

  const payload: Record<string, unknown> = {};

  // Set target
  if (options.token) {
    payload.to = options.token;
  } else if (options.tokens) {
    payload.registration_ids = options.tokens;
  } else if (options.topic) {
    payload.to = `/topics/${options.topic}`;
  } else if (options.condition) {
    payload.condition = options.condition;
  }

  // Set notification payload
  if (options.notification) {
    payload.notification = {
      title: options.notification.title,
      body: options.notification.body,
      image: options.notification.image,
      icon: options.notification.icon,
      sound: options.notification.sound,
      badge: options.notification.badge,
      tag: options.notification.tag,
      color: options.notification.color,
      click_action: options.notification.clickAction,
    };
  }

  // Set data payload
  if (options.data) {
    payload.data = options.data;
  }

  // Platform-specific options
  if (options.android) {
    payload.android = options.android;
  }
  if (options.apns) {
    payload.apns = options.apns;
  }
  if (options.webpush) {
    payload.webpush = options.webpush;
  }

  // General options
  if (options.priority) {
    payload.priority = options.priority;
  }
  if (options.contentAvailable !== undefined) {
    payload.content_available = options.contentAvailable;
  }
  if (options.mutableContent !== undefined) {
    payload.mutable_content = options.mutableContent;
  }
  if (options.timeToLive !== undefined) {
    payload.time_to_live = options.timeToLive;
  }
  if (options.dryRun !== undefined) {
    payload.dry_run = options.dryRun;
  }

  const response = await axios.post(fcmApiUrl, payload, {
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  logger.info(
    {
      success: response.data.success,
      failure: response.data.failure,
      messageId: response.data.message_id,
    },
    'FCM notification sent'
  );

  return {
    messageId: response.data.message_id,
    multicastId: response.data.multicast_id,
    success: response.data.success || 0,
    failure: response.data.failure || 0,
    canonicalIds: response.data.canonical_ids,
    results: response.data.results,
  };
}

const sendNotificationWithBreaker = createCircuitBreaker(sendNotificationInternal, {
  timeout: 15000,
  name: 'fcm-send-notification',
});

const sendNotificationRateLimited = withRateLimit(
  async (options: SendNotificationOptions) => sendNotificationWithBreaker.fire(options),
  fcmRateLimiter
);

export async function sendNotification(options: SendNotificationOptions): Promise<NotificationResponse> {
  return await sendNotificationRateLimited(options) as unknown as NotificationResponse;
}

export interface SendToTopicOptions {
  topic: string;
  notification: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
  priority?: 'normal' | 'high';
}

/**
 * Send notification to topic subscribers
 */
export async function sendToTopic(options: SendToTopicOptions): Promise<NotificationResponse> {
  return sendNotification({
    topic: options.topic,
    notification: options.notification,
    data: options.data,
    priority: options.priority,
  });
}

export interface SendToDeviceGroupOptions {
  notificationKey: string;
  notification: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
}

/**
 * Send notification to device group
 */
async function sendToDeviceGroupInternal(options: SendToDeviceGroupOptions): Promise<NotificationResponse> {
  if (!FCM_SERVER_KEY) {
    throw new Error('FCM credentials not set. Set FCM_SERVER_KEY.');
  }

  logger.info({ notificationKey: options.notificationKey }, 'Sending FCM notification to device group');

  const response = await axios.post(
    fcmApiUrl,
    {
      to: options.notificationKey,
      notification: options.notification,
      data: options.data,
    },
    {
      headers: {
        Authorization: `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ success: response.data.success }, 'FCM notification sent to device group');

  return {
    success: response.data.success || 0,
    failure: response.data.failure || 0,
  };
}

const sendToDeviceGroupWithBreaker = createCircuitBreaker(sendToDeviceGroupInternal, {
  timeout: 15000,
  name: 'fcm-send-to-device-group',
});

const sendToDeviceGroupRateLimited = withRateLimit(
  async (options: SendToDeviceGroupOptions) => sendToDeviceGroupWithBreaker.fire(options),
  fcmRateLimiter
);

export async function sendToDeviceGroup(options: SendToDeviceGroupOptions): Promise<NotificationResponse> {
  return await sendToDeviceGroupRateLimited(options) as unknown as NotificationResponse;
}

export interface SubscribeToTopicOptions {
  tokens: string[]; // Device tokens to subscribe
  topic: string; // Topic name
}

export interface TopicManagementResponse {
  results: Array<{ error?: string }>;
}

/**
 * Subscribe devices to topic
 */
async function subscribeToTopicInternal(options: SubscribeToTopicOptions): Promise<TopicManagementResponse> {
  if (!FCM_SERVER_KEY) {
    throw new Error('FCM credentials not set. Set FCM_SERVER_KEY.');
  }

  logger.info(
    {
      tokenCount: options.tokens.length,
      topic: options.topic,
    },
    'Subscribing devices to FCM topic'
  );

  const response = await axios.post(
    `https://iid.googleapis.com/iid/v1:batchAdd`,
    {
      to: `/topics/${options.topic}`,
      registration_tokens: options.tokens,
    },
    {
      headers: {
        Authorization: `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ topic: options.topic }, 'Devices subscribed to FCM topic');

  return {
    results: response.data.results || [],
  };
}

const subscribeToTopicWithBreaker = createCircuitBreaker(subscribeToTopicInternal, {
  timeout: 10000,
  name: 'fcm-subscribe-to-topic',
});

const subscribeToTopicRateLimited = withRateLimit(
  async (options: SubscribeToTopicOptions) => subscribeToTopicWithBreaker.fire(options),
  fcmRateLimiter
);

export async function subscribeToTopic(options: SubscribeToTopicOptions): Promise<TopicManagementResponse> {
  return await subscribeToTopicRateLimited(options) as unknown as TopicManagementResponse;
}

export interface UnsubscribeFromTopicOptions {
  tokens: string[]; // Device tokens to unsubscribe
  topic: string; // Topic name
}

/**
 * Unsubscribe devices from topic
 */
async function unsubscribeFromTopicInternal(options: UnsubscribeFromTopicOptions): Promise<TopicManagementResponse> {
  if (!FCM_SERVER_KEY) {
    throw new Error('FCM credentials not set. Set FCM_SERVER_KEY.');
  }

  logger.info(
    {
      tokenCount: options.tokens.length,
      topic: options.topic,
    },
    'Unsubscribing devices from FCM topic'
  );

  const response = await axios.post(
    `https://iid.googleapis.com/iid/v1:batchRemove`,
    {
      to: `/topics/${options.topic}`,
      registration_tokens: options.tokens,
    },
    {
      headers: {
        Authorization: `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ topic: options.topic }, 'Devices unsubscribed from FCM topic');

  return {
    results: response.data.results || [],
  };
}

const unsubscribeFromTopicWithBreaker = createCircuitBreaker(unsubscribeFromTopicInternal, {
  timeout: 10000,
  name: 'fcm-unsubscribe-from-topic',
});

const unsubscribeFromTopicRateLimited = withRateLimit(
  async (options: UnsubscribeFromTopicOptions) => unsubscribeFromTopicWithBreaker.fire(options),
  fcmRateLimiter
);

export async function unsubscribeFromTopic(options: UnsubscribeFromTopicOptions): Promise<TopicManagementResponse> {
  return await unsubscribeFromTopicRateLimited(options) as unknown as TopicManagementResponse;
}

export interface GetTokenInfoOptions {
  token: string;
}

export interface TokenInfo {
  application?: string;
  applicationVersion?: string;
  platform?: string;
  rel?: {
    topics?: Record<string, { addDate: string }>;
  };
}

/**
 * Get information about a device token
 */
async function getTokenInfoInternal(token: string): Promise<TokenInfo> {
  if (!FCM_SERVER_KEY) {
    throw new Error('FCM credentials not set. Set FCM_SERVER_KEY.');
  }

  logger.info({ token }, 'Fetching FCM token info');

  const response = await axios.get(`https://iid.googleapis.com/iid/info/${token}?details=true`, {
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
    },
  });

  logger.info({ token, platform: response.data.platform }, 'FCM token info retrieved');

  return {
    application: response.data.application,
    applicationVersion: response.data.applicationVersion,
    platform: response.data.platform,
    rel: response.data.rel,
  };
}

const getTokenInfoWithBreaker = createCircuitBreaker(getTokenInfoInternal, {
  timeout: 10000,
  name: 'fcm-get-token-info',
});

const getTokenInfoRateLimited = withRateLimit(
  async (token: string) => getTokenInfoWithBreaker.fire(token),
  fcmRateLimiter
);

export async function getTokenInfo(token: string): Promise<TokenInfo> {
  return await getTokenInfoRateLimited(token) as unknown as TokenInfo;
}

export interface SendDataMessageOptions {
  token: string;
  data: Record<string, string>;
  priority?: 'normal' | 'high';
  timeToLive?: number; // In seconds
}

/**
 * Send data-only message (no notification, handled by app)
 */
export async function sendDataMessage(options: SendDataMessageOptions): Promise<NotificationResponse> {
  return sendNotification({
    token: options.token,
    data: options.data,
    priority: options.priority,
    timeToLive: options.timeToLive,
    contentAvailable: true,
  });
}

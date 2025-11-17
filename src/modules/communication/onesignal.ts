import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * OneSignal Module
 *
 * Send push notifications to mobile and web users
 * - Send push notifications
 * - Create user segments
 * - Get notification stats
 * - Schedule notifications
 * - Track delivery and engagement
 * - Manage devices and users
 * - Built-in resilience
 *
 * Perfect for:
 * - Mobile app notifications
 * - Web push notifications
 * - User engagement campaigns
 * - Transactional alerts
 * - Marketing messages
 */

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
  logger.warn('⚠️  ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY not set. OneSignal features will not work.');
}

const oneSignalApiUrl = 'https://onesignal.com/api/v1';

// Rate limiter: OneSignal has generous limits
const oneSignalRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 100, // 100ms between requests
  reservoir: 300,
  reservoirRefreshAmount: 300,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'onesignal',
});

export interface SendNotificationOptions {
  contents: { en: string; [key: string]: string }; // Localized content
  headings?: { en: string; [key: string]: string }; // Localized headings
  subtitle?: { en: string; [key: string]: string };

  // Targeting
  includedSegments?: string[]; // e.g., ['All', 'Active Users']
  includePlayerIds?: string[]; // Specific device IDs
  includeExternalUserIds?: string[]; // Your user IDs

  // Delivery
  sendAfter?: string; // ISO 8601 timestamp
  delayedOption?: 'timezone' | 'last-active';
  deliveryTimeOfDay?: string; // e.g., '9:00AM'

  // Content
  data?: Record<string, unknown>; // Custom data payload
  url?: string; // Deep link or URL
  webUrl?: string; // Web-specific URL
  appUrl?: string; // App-specific URL

  // Media
  bigPicture?: string; // Large image URL (Android)
  iosAttachments?: Record<string, string>; // iOS media attachments

  // Buttons
  buttons?: Array<{
    id: string;
    text: string;
    icon?: string;
    url?: string;
  }>;

  // Android
  androidChannelId?: string;
  androidSound?: string;
  androidAccentColor?: string;

  // iOS
  iosSound?: string;
  iosBadgeType?: 'None' | 'SetTo' | 'Increase';
  iosBadgeCount?: number;
}

export interface NotificationResponse {
  id: string;
  recipients: number;
  errors?: string[];
}

/**
 * Send push notification
 */
async function sendNotificationInternal(options: SendNotificationOptions): Promise<NotificationResponse> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new Error('OneSignal credentials not set. Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY.');
  }

  logger.info(
    {
      hasSegments: !!options.includedSegments,
      hasPlayerIds: !!options.includePlayerIds,
      hasExternalUserIds: !!options.includeExternalUserIds,
    },
    'Sending OneSignal notification'
  );

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    contents: options.contents,
    headings: options.headings,
    subtitle: options.subtitle,
    included_segments: options.includedSegments,
    include_player_ids: options.includePlayerIds,
    include_external_user_ids: options.includeExternalUserIds,
    send_after: options.sendAfter,
    delayed_option: options.delayedOption,
    delivery_time_of_day: options.deliveryTimeOfDay,
    data: options.data,
    url: options.url,
    web_url: options.webUrl,
    app_url: options.appUrl,
    big_picture: options.bigPicture,
    ios_attachments: options.iosAttachments,
    buttons: options.buttons,
    android_channel_id: options.androidChannelId,
    android_sound: options.androidSound,
    android_accent_color: options.androidAccentColor,
    ios_sound: options.iosSound,
    ios_badgeType: options.iosBadgeType,
    ios_badgeCount: options.iosBadgeCount,
  };

  const response = await axios.post(`${oneSignalApiUrl}/notifications`, payload, {
    headers: {
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  logger.info(
    {
      notificationId: response.data.id,
      recipients: response.data.recipients,
    },
    'OneSignal notification sent'
  );

  return {
    id: response.data.id,
    recipients: response.data.recipients,
    errors: response.data.errors,
  };
}

const sendNotificationWithBreaker = createCircuitBreaker(sendNotificationInternal, {
  timeout: 15000,
  name: 'onesignal-send-notification',
});

const sendNotificationRateLimited = withRateLimit(
  async (options: SendNotificationOptions) => sendNotificationWithBreaker.fire(options),
  oneSignalRateLimiter
);

export async function sendNotification(options: SendNotificationOptions): Promise<NotificationResponse> {
  return await sendNotificationRateLimited(options) as unknown as NotificationResponse;
}

export interface CreateSegmentOptions {
  name: string;
  filters: Array<{
    field: string;
    relation: string;
    value?: string;
  }>;
}

export interface SegmentResponse {
  id: string;
  name: string;
  filters: Array<{
    field: string;
    relation: string;
    value?: string;
  }>;
}

/**
 * Create user segment for targeted notifications
 */
async function createSegmentInternal(options: CreateSegmentOptions): Promise<SegmentResponse> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    throw new Error('OneSignal credentials not set. Set ONESIGNAL_APP_ID and ONESIGNAL_API_KEY.');
  }

  logger.info({ name: options.name }, 'Creating OneSignal segment');

  const response = await axios.post(
    `${oneSignalApiUrl}/apps/${ONESIGNAL_APP_ID}/segments`,
    {
      name: options.name,
      filters: options.filters,
    },
    {
      headers: {
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ segmentId: response.data.id, name: response.data.name }, 'OneSignal segment created');

  return {
    id: response.data.id,
    name: response.data.name,
    filters: response.data.filters,
  };
}

const createSegmentWithBreaker = createCircuitBreaker(createSegmentInternal, {
  timeout: 10000,
  name: 'onesignal-create-segment',
});

const createSegmentRateLimited = withRateLimit(
  async (options: CreateSegmentOptions) => createSegmentWithBreaker.fire(options),
  oneSignalRateLimiter
);

export async function createSegment(options: CreateSegmentOptions): Promise<SegmentResponse> {
  return await createSegmentRateLimited(options) as unknown as SegmentResponse;
}

export interface NotificationStats {
  id: string;
  successful: number;
  failed: number;
  errored: number;
  converted: number;
  remaining: number;
  queued_at: number;
  send_after: number;
  completed_at: number | null;
  platform_delivery_stats?: {
    ios?: { successful: number; failed: number; errored: number };
    android?: { successful: number; failed: number; errored: number };
    web?: { successful: number; failed: number; errored: number };
  };
}

/**
 * Get notification delivery and engagement stats
 */
async function getNotificationStatsInternal(notificationId: string): Promise<NotificationStats> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new Error('OneSignal credentials not set. Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY.');
  }

  logger.info({ notificationId }, 'Fetching OneSignal notification stats');

  const response = await axios.get(
    `${oneSignalApiUrl}/notifications/${notificationId}?app_id=${ONESIGNAL_APP_ID}`,
    {
      headers: {
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
    }
  );

  logger.info(
    {
      notificationId,
      successful: response.data.successful,
      failed: response.data.failed,
    },
    'OneSignal notification stats retrieved'
  );

  return {
    id: response.data.id,
    successful: response.data.successful,
    failed: response.data.failed,
    errored: response.data.errored,
    converted: response.data.converted,
    remaining: response.data.remaining,
    queued_at: response.data.queued_at,
    send_after: response.data.send_after,
    completed_at: response.data.completed_at,
    platform_delivery_stats: response.data.platform_delivery_stats,
  };
}

const getNotificationStatsWithBreaker = createCircuitBreaker(getNotificationStatsInternal, {
  timeout: 10000,
  name: 'onesignal-get-notification-stats',
});

const getNotificationStatsRateLimited = withRateLimit(
  async (notificationId: string) => getNotificationStatsWithBreaker.fire(notificationId),
  oneSignalRateLimiter
);

export async function getNotificationStats(notificationId: string): Promise<NotificationStats> {
  return await getNotificationStatsRateLimited(notificationId) as unknown as NotificationStats;
}

export interface CancelNotificationOptions {
  notificationId: string;
}

/**
 * Cancel scheduled notification
 */
async function cancelNotificationInternal(notificationId: string): Promise<{ success: boolean }> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new Error('OneSignal credentials not set. Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY.');
  }

  logger.info({ notificationId }, 'Canceling OneSignal notification');

  await axios.delete(
    `${oneSignalApiUrl}/notifications/${notificationId}?app_id=${ONESIGNAL_APP_ID}`,
    {
      headers: {
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
    }
  );

  logger.info({ notificationId }, 'OneSignal notification canceled');

  return { success: true };
}

const cancelNotificationWithBreaker = createCircuitBreaker(cancelNotificationInternal, {
  timeout: 10000,
  name: 'onesignal-cancel-notification',
});

const cancelNotificationRateLimited = withRateLimit(
  async (notificationId: string) => cancelNotificationWithBreaker.fire(notificationId),
  oneSignalRateLimiter
);

export async function cancelNotification(notificationId: string): Promise<{ success: boolean }> {
  return await cancelNotificationRateLimited(notificationId) as unknown as { success: boolean };
}

export interface ViewDeviceOptions {
  playerId: string;
}

export interface DeviceInfo {
  id: string;
  device_type: number;
  device_model?: string;
  device_os?: string;
  app_version?: string;
  created_at: number;
  last_active: number;
  tags?: Record<string, string>;
}

/**
 * View device information
 */
async function viewDeviceInternal(playerId: string): Promise<DeviceInfo> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new Error('OneSignal credentials not set. Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY.');
  }

  logger.info({ playerId }, 'Fetching OneSignal device info');

  const response = await axios.get(
    `${oneSignalApiUrl}/players/${playerId}?app_id=${ONESIGNAL_APP_ID}`,
    {
      headers: {
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
    }
  );

  logger.info({ playerId, deviceType: response.data.device_type }, 'OneSignal device info retrieved');

  return {
    id: response.data.id,
    device_type: response.data.device_type,
    device_model: response.data.device_model,
    device_os: response.data.device_os,
    app_version: response.data.app_version,
    created_at: response.data.created_at,
    last_active: response.data.last_active,
    tags: response.data.tags,
  };
}

const viewDeviceWithBreaker = createCircuitBreaker(viewDeviceInternal, {
  timeout: 10000,
  name: 'onesignal-view-device',
});

const viewDeviceRateLimited = withRateLimit(
  async (playerId: string) => viewDeviceWithBreaker.fire(playerId),
  oneSignalRateLimiter
);

export async function viewDevice(playerId: string): Promise<DeviceInfo> {
  return await viewDeviceRateLimited(playerId) as unknown as DeviceInfo;
}

export interface EditDeviceOptions {
  playerId: string;
  tags?: Record<string, string>;
  language?: string;
  timezone?: number;
  gameVersion?: string;
  deviceModel?: string;
  deviceOs?: string;
}

/**
 * Edit device tags and properties
 */
async function editDeviceInternal(options: EditDeviceOptions): Promise<{ success: boolean }> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new Error('OneSignal credentials not set. Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY.');
  }

  logger.info({ playerId: options.playerId }, 'Editing OneSignal device');

  await axios.put(
    `${oneSignalApiUrl}/players/${options.playerId}`,
    {
      app_id: ONESIGNAL_APP_ID,
      tags: options.tags,
      language: options.language,
      timezone: options.timezone,
      game_version: options.gameVersion,
      device_model: options.deviceModel,
      device_os: options.deviceOs,
    },
    {
      headers: {
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info({ playerId: options.playerId }, 'OneSignal device updated');

  return { success: true };
}

const editDeviceWithBreaker = createCircuitBreaker(editDeviceInternal, {
  timeout: 10000,
  name: 'onesignal-edit-device',
});

const editDeviceRateLimited = withRateLimit(
  async (options: EditDeviceOptions) => editDeviceWithBreaker.fire(options),
  oneSignalRateLimiter
);

export async function editDevice(options: EditDeviceOptions): Promise<{ success: boolean }> {
  return await editDeviceRateLimited(options) as unknown as { success: boolean };
}

export interface AppStats {
  total_devices: number;
  active_devices: number;
  inactive_devices: number;
}

/**
 * Get app-level statistics
 */
async function getAppStatsInternal(): Promise<AppStats> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    throw new Error('OneSignal credentials not set. Set ONESIGNAL_APP_ID and ONESIGNAL_API_KEY.');
  }

  logger.info('Fetching OneSignal app stats');

  const response = await axios.get(`${oneSignalApiUrl}/apps/${ONESIGNAL_APP_ID}`, {
    headers: {
      Authorization: `Basic ${ONESIGNAL_API_KEY}`,
    },
  });

  logger.info(
    {
      totalDevices: response.data.players,
      messageable: response.data.messageable_players,
    },
    'OneSignal app stats retrieved'
  );

  return {
    total_devices: response.data.players,
    active_devices: response.data.messageable_players,
    inactive_devices: response.data.players - response.data.messageable_players,
  };
}

const getAppStatsWithBreaker = createCircuitBreaker(getAppStatsInternal, {
  timeout: 10000,
  name: 'onesignal-get-app-stats',
});

const getAppStatsRateLimited = withRateLimit(
  async () => getAppStatsWithBreaker.fire(),
  oneSignalRateLimiter
);

export async function getAppStats(): Promise<AppStats> {
  return await getAppStatsRateLimited() as unknown as AppStats;
}

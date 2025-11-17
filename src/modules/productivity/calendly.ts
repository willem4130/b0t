import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Calendly Module
 *
 * Manage Calendly scheduling and availability
 * - Get user availability
 * - List events
 * - Get event details
 * - Create scheduled events
 * - Built-in resilience
 *
 * Perfect for:
 * - Appointment scheduling automation
 * - Calendar integration
 * - Meeting scheduling workflows
 * - Availability management
 */

const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;

if (!CALENDLY_API_KEY) {
  logger.warn('⚠️  CALENDLY_API_KEY not set. Calendly features will not work.');
}

const CALENDLY_API_BASE = 'https://api.calendly.com';

// Rate limiter: Calendly allows 100 req/min
const calendlyRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 600, // 600ms between requests ≈ 100/min
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60000,
  id: 'calendly',
});

export interface CalendlyEvent {
  uri: string;
  name: string;
  status: 'active' | 'inactive';
  slug?: string;
  type: 'AdhocEventType' | 'StandardEventType';
  created_at: string;
  updated_at: string;
}

export interface CalendlyEventInstance {
  uri: string;
  event_type: string;
  invitees_counter: {
    total_invitees: number;
    active_invitees: number;
    limit_invitees: number;
  };
  created_at: string;
  updated_at: string;
  start_time: string;
  end_time: string;
  event_memberships: Array<{ user: string }>;
  invitees: Array<{ uri: string; email: string; name: string }>;
}

/**
 * Get current user (internal)
 */
async function getCurrentUserInternal(): Promise<{ resource: { uri: string; name: string } }> {
  if (!CALENDLY_API_KEY) {
    throw new Error('Calendly API key not set. Set CALENDLY_API_KEY.');
  }

  logger.info({}, 'Fetching Calendly user');

  const response = await fetch(`${CALENDLY_API_BASE}/users/me`, {
    headers: {
      Authorization: `Bearer ${CALENDLY_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Calendly API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { resource: { uri: string; name: string } };

  logger.info({ user: data.resource.name }, 'Calendly user fetched');
  return data;
}

/**
 * Get current user (protected)
 */
const getCurrentUserWithBreaker = createCircuitBreaker(getCurrentUserInternal, {
  timeout: 10000,
  name: 'calendly-get-current-user',
});

export const getCurrentUser = withRateLimit(
  () => getCurrentUserWithBreaker.fire(),
  calendlyRateLimiter
);

/**
 * List event types (internal)
 */
async function listEventTypesInternal(userUri: string): Promise<CalendlyEvent[]> {
  if (!CALENDLY_API_KEY) {
    throw new Error('Calendly API key not set. Set CALENDLY_API_KEY.');
  }

  logger.info({ userUri }, 'Listing Calendly event types');

  const params = new URLSearchParams({ user: userUri });

  const response = await fetch(`${CALENDLY_API_BASE}/event_types?${params}`, {
    headers: {
      Authorization: `Bearer ${CALENDLY_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Calendly API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { collection: CalendlyEvent[] };

  logger.info({ eventCount: data.collection.length }, 'Calendly event types listed');
  return data.collection;
}

/**
 * List event types (protected)
 */
const listEventTypesWithBreaker = createCircuitBreaker(listEventTypesInternal, {
  timeout: 10000,
  name: 'calendly-list-event-types',
});

export const listEventTypes = withRateLimit(
  (userUri: string) => listEventTypesWithBreaker.fire(userUri),
  calendlyRateLimiter
);

/**
 * List scheduled events (internal)
 */
async function listEventsInternal(
  userUri: string,
  options: { pageSize?: number; status?: 'active' | 'cancelled' } = {}
): Promise<CalendlyEventInstance[]> {
  if (!CALENDLY_API_KEY) {
    throw new Error('Calendly API key not set. Set CALENDLY_API_KEY.');
  }

  logger.info({ userUri, status: options.status }, 'Listing Calendly events');

  const params = new URLSearchParams({
    user: userUri,
    count: String(options.pageSize || 50),
    status: options.status || 'active',
  });

  const response = await fetch(`${CALENDLY_API_BASE}/scheduled_events?${params}`, {
    headers: {
      Authorization: `Bearer ${CALENDLY_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Calendly API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { collection: CalendlyEventInstance[] };

  logger.info({ eventCount: data.collection.length }, 'Calendly events listed');
  return data.collection;
}

/**
 * List events (protected)
 */
const listEventsWithBreaker = createCircuitBreaker(listEventsInternal, {
  timeout: 15000,
  name: 'calendly-list-events',
});

export const listEvents = withRateLimit(
  (userUri: string, options?: { pageSize?: number; status?: 'active' | 'cancelled' }) =>
    listEventsWithBreaker.fire(userUri, options),
  calendlyRateLimiter
);

/**
 * Get event details (internal)
 */
async function getEventInternal(eventUri: string): Promise<CalendlyEventInstance> {
  if (!CALENDLY_API_KEY) {
    throw new Error('Calendly API key not set. Set CALENDLY_API_KEY.');
  }

  logger.info({ eventUri }, 'Fetching Calendly event');

  const response = await fetch(eventUri, {
    headers: {
      Authorization: `Bearer ${CALENDLY_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Calendly API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { resource: CalendlyEventInstance };

  logger.info({ eventUri }, 'Calendly event fetched');
  return data.resource;
}

/**
 * Get event (protected)
 */
const getEventWithBreaker = createCircuitBreaker(getEventInternal, {
  timeout: 10000,
  name: 'calendly-get-event',
});

export const getEvent = withRateLimit(
  (eventUri: string) => getEventWithBreaker.fire(eventUri),
  calendlyRateLimiter
);

/**
 * Cancel event (internal)
 */
async function cancelEventInternal(eventUri: string, reason?: string): Promise<void> {
  if (!CALENDLY_API_KEY) {
    throw new Error('Calendly API key not set. Set CALENDLY_API_KEY.');
  }

  logger.info({ eventUri, reason }, 'Cancelling Calendly event');

  const response = await fetch(`${eventUri}/cancellation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CALENDLY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error(`Calendly API error: ${response.statusText}`);
  }

  logger.info({ eventUri }, 'Calendly event cancelled');
}

/**
 * Cancel event (protected)
 */
const cancelEventWithBreaker = createCircuitBreaker(cancelEventInternal, {
  timeout: 10000,
  name: 'calendly-cancel-event',
});

export const cancelEvent = withRateLimit(
  (eventUri: string, reason?: string) => cancelEventWithBreaker.fire(eventUri, reason),
  calendlyRateLimiter
);

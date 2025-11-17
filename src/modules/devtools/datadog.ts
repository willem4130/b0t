import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Datadog Module
 *
 * Send metrics, events, and query monitoring data
 * - Send custom metrics
 * - Create events
 * - Query metrics
 * - Get logs
 * - Monitor infrastructure
 * - Built-in resilience
 *
 * Perfect for:
 * - Application monitoring
 * - Performance tracking
 * - Custom metrics
 * - Alerting and notifications
 */

const DATADOG_API_KEY = process.env.DATADOG_API_KEY;
const DATADOG_APP_KEY = process.env.DATADOG_APP_KEY;
const DATADOG_SITE = process.env.DATADOG_SITE || 'datadoghq.com';

if (!DATADOG_API_KEY) {
  logger.warn('⚠️  DATADOG_API_KEY not set. Datadog features will not work.');
}

const DATADOG_API_BASE = `https://api.${DATADOG_SITE}/api`;

// Rate limiter: Datadog allows 1000 req/hour = ~16 req/min (conservative)
const datadogRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 3750, // 3.75s = ~16/min
  reservoir: 1000,
  reservoirRefreshAmount: 1000,
  reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
  id: 'datadog',
});

export interface Metric {
  metric: string;
  points: Array<{ timestamp: number; value: number }>;
  type?: 'count' | 'gauge' | 'rate';
  tags?: string[];
  host?: string;
}

export interface Event {
  title: string;
  text: string;
  alertType?: 'error' | 'warning' | 'info' | 'success';
  tags?: string[];
  priority?: 'normal' | 'low';
  host?: string;
}

export interface LogEntry {
  message: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  service?: string;
  tags?: string[];
  hostname?: string;
  timestamp?: number;
}

/**
 * Internal function to make Datadog API request
 */
async function datadogRequest<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  data?: unknown,
  version: 'v1' | 'v2' = 'v1'
): Promise<T> {
  if (!DATADOG_API_KEY) {
    throw new Error('Datadog API key not set. Set DATADOG_API_KEY.');
  }

  const url = `${DATADOG_API_BASE}/${version}${endpoint}`;
  const headers: Record<string, string> = {
    'DD-API-KEY': DATADOG_API_KEY,
    'Content-Type': 'application/json',
  };

  if (DATADOG_APP_KEY) {
    headers['DD-APPLICATION-KEY'] = DATADOG_APP_KEY;
  }

  logger.info({ method, endpoint }, 'Making Datadog API request');

  const response = await axios({
    method,
    url,
    headers,
    data,
  });

  logger.info({ method, endpoint, status: response.status }, 'Datadog API request successful');

  return response.data as T;
}

/**
 * Send metrics
 */
async function sendMetricsInternal(metrics: Metric[]): Promise<{ status: string }> {
  logger.info({ metricCount: metrics.length }, 'Sending metrics to Datadog');

  const payload = {
    series: metrics.map((metric) => ({
      metric: metric.metric,
      points: metric.points.map((point) => [point.timestamp, point.value]),
      type: metric.type || 'gauge',
      tags: metric.tags,
      host: metric.host,
    })),
  };

  const response = await datadogRequest<{ status: string }>('POST', '/series', payload);

  logger.info({ metricCount: metrics.length }, 'Metrics sent successfully');

  return response;
}

const sendMetricsWithBreaker = createCircuitBreaker(sendMetricsInternal, {
  timeout: 15000,
  name: 'datadog-send-metrics',
});

const sendMetricsRateLimited = withRateLimit(
  async (metrics: Metric[]) => sendMetricsWithBreaker.fire(metrics),
  datadogRateLimiter
);

export async function sendMetrics(metrics: Metric[]): Promise<{ status: string }> {
  return (await sendMetricsRateLimited(metrics)) as { status: string };
}

/**
 * Send single metric (convenience function)
 */
export async function sendMetric(
  metricName: string,
  value: number,
  options?: {
    type?: 'count' | 'gauge' | 'rate';
    tags?: string[];
    host?: string;
    timestamp?: number;
  }
): Promise<{ status: string }> {
  const metric: Metric = {
    metric: metricName,
    points: [
      {
        timestamp: options?.timestamp || Math.floor(Date.now() / 1000),
        value,
      },
    ],
    type: options?.type || 'gauge',
    tags: options?.tags,
    host: options?.host,
  };

  return sendMetrics([metric]);
}

/**
 * Create event
 */
async function createEventInternal(event: Event): Promise<{ event: { id: number } }> {
  logger.info({ title: event.title }, 'Creating Datadog event');

  const payload = {
    title: event.title,
    text: event.text,
    alert_type: event.alertType || 'info',
    tags: event.tags,
    priority: event.priority || 'normal',
    host: event.host,
  };

  const response = await datadogRequest<{ event: { id: number } }>('POST', '/events', payload);

  logger.info({ eventId: response.event.id }, 'Event created successfully');

  return response;
}

const createEventWithBreaker = createCircuitBreaker(createEventInternal, {
  timeout: 15000,
  name: 'datadog-create-event',
});

const createEventRateLimited = withRateLimit(
  async (event: Event) => createEventWithBreaker.fire(event),
  datadogRateLimiter
);

export async function createEvent(event: Event): Promise<{ event: { id: number } }> {
  return (await createEventRateLimited(event)) as { event: { id: number } };
}

/**
 * Query metrics
 */
export async function queryMetrics(
  query: string,
  from: number,
  to: number
): Promise<{
  series: Array<{
    metric: string;
    points: Array<[number, number]>;
    scope: string;
  }>;
}> {
  if (!DATADOG_APP_KEY) {
    throw new Error('Datadog application key required for queries. Set DATADOG_APP_KEY.');
  }

  logger.info({ query, from, to }, 'Querying Datadog metrics');

  const params = new URLSearchParams({
    query,
    from: from.toString(),
    to: to.toString(),
  });

  const response = await datadogRequest<{
    series: Array<{
      metric: string;
      points: Array<[number, number]>;
      scope: string;
    }>;
  }>('GET', `/query?${params.toString()}`);

  logger.info({ seriesCount: response.series.length }, 'Metrics query completed');

  return response;
}

/**
 * Send logs
 */
export async function sendLogs(logs: LogEntry[]): Promise<{ status: string }> {
  logger.info({ logCount: logs.length }, 'Sending logs to Datadog');

  const payload = logs.map((log) => ({
    message: log.message,
    level: log.level || 'info',
    service: log.service,
    ddsource: 'nodejs',
    ddtags: log.tags?.join(','),
    hostname: log.hostname,
    timestamp: log.timestamp || Date.now(),
  }));

  const response = await datadogRequest<{ status: string }>('POST', '/logs', payload, 'v2');

  logger.info({ logCount: logs.length }, 'Logs sent successfully');

  return response;
}

/**
 * Send single log (convenience function)
 */
export async function sendLog(
  message: string,
  options?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    service?: string;
    tags?: string[];
    hostname?: string;
  }
): Promise<{ status: string }> {
  const log: LogEntry = {
    message,
    level: options?.level || 'info',
    service: options?.service,
    tags: options?.tags,
    hostname: options?.hostname,
    timestamp: Date.now(),
  };

  return sendLogs([log]);
}

/**
 * Get service level objectives (SLOs)
 */
export async function getSLOs(): Promise<
  Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    tags: string[];
  }>
> {
  if (!DATADOG_APP_KEY) {
    throw new Error('Datadog application key required. Set DATADOG_APP_KEY.');
  }

  logger.info('Getting Datadog SLOs');

  const response = await datadogRequest<{
    data: Array<{
      id: string;
      attributes: {
        name: string;
        description: string;
        type: string;
        tags: string[];
      };
    }>;
  }>('GET', '/slo', undefined, 'v1');

  logger.info({ sloCount: response.data.length }, 'SLOs retrieved');

  return response.data.map((slo) => ({
    id: slo.id,
    name: slo.attributes.name,
    description: slo.attributes.description,
    type: slo.attributes.type,
    tags: slo.attributes.tags,
  }));
}

/**
 * Get monitors
 */
export async function getMonitors(options?: {
  tags?: string[];
  name?: string;
}): Promise<
  Array<{
    id: number;
    name: string;
    type: string;
    query: string;
    message: string;
    tags: string[];
    overallState: string;
  }>
> {
  if (!DATADOG_APP_KEY) {
    throw new Error('Datadog application key required. Set DATADOG_APP_KEY.');
  }

  logger.info({ options }, 'Getting Datadog monitors');

  const params = new URLSearchParams();
  if (options?.tags) params.append('tags', options.tags.join(','));
  if (options?.name) params.append('name', options.name);

  const queryString = params.toString();
  const endpoint = `/monitor${queryString ? `?${queryString}` : ''}`;

  const response = await datadogRequest<
    Array<{
      id: number;
      name: string;
      type: string;
      query: string;
      message: string;
      tags: string[];
      overall_state: string;
    }>
  >('GET', endpoint);

  logger.info({ monitorCount: response.length }, 'Monitors retrieved');

  return response.map((monitor) => ({
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    query: monitor.query,
    message: monitor.message,
    tags: monitor.tags,
    overallState: monitor.overall_state,
  }));
}

/**
 * Increment counter metric (convenience function)
 */
export async function incrementCounter(
  metricName: string,
  increment: number = 1,
  tags?: string[]
): Promise<{ status: string }> {
  return sendMetric(metricName, increment, {
    type: 'count',
    tags,
  });
}

/**
 * Set gauge metric (convenience function)
 */
export async function setGauge(
  metricName: string,
  value: number,
  tags?: string[]
): Promise<{ status: string }> {
  return sendMetric(metricName, value, {
    type: 'gauge',
    tags,
  });
}

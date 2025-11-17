import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Google Analytics Module
 *
 * Access and analyze Google Analytics 4 (GA4) data
 * - Run custom reports with dimensions and metrics
 * - Get real-time analytics data
 * - Retrieve metadata for available dimensions/metrics
 * - Create custom audiences
 * - Built-in resilience
 *
 * Perfect for:
 * - Automated reporting and dashboards
 * - Performance monitoring
 * - User behavior analysis
 * - Marketing attribution tracking
 * - Real-time visitor insights
 * - Custom audience creation for remarketing
 */

const GOOGLE_ANALYTICS_PROPERTY_ID = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
const GOOGLE_ANALYTICS_CREDENTIALS = process.env.GOOGLE_ANALYTICS_CREDENTIALS;

if (!GOOGLE_ANALYTICS_PROPERTY_ID) {
  logger.warn('⚠️  GOOGLE_ANALYTICS_PROPERTY_ID not set. Google Analytics features will not work.');
}

if (!GOOGLE_ANALYTICS_CREDENTIALS) {
  logger.warn('⚠️  GOOGLE_ANALYTICS_CREDENTIALS not set. Google Analytics features will not work.');
}

let analyticsClient: BetaAnalyticsDataClient | null = null;

// Initialize client with service account credentials
if (GOOGLE_ANALYTICS_CREDENTIALS) {
  try {
    const credentials = JSON.parse(GOOGLE_ANALYTICS_CREDENTIALS);
    analyticsClient = new BetaAnalyticsDataClient({
      credentials,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to initialize Google Analytics client'
    );
  }
}

// Rate limiter: GA4 allows ~10 requests per second
const analyticsRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // 100ms between requests = ~10/sec
  reservoir: 10,
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 1000, // 1 second
  id: 'google-analytics',
});

export interface RunReportOptions {
  dateRanges: Array<{
    startDate: string; // Format: 'YYYY-MM-DD' or 'today', 'yesterday', '7daysAgo'
    endDate: string;
  }>;
  dimensions?: Array<{
    name: string; // e.g., 'country', 'city', 'pageTitle', 'eventName'
  }>;
  metrics: Array<{
    name: string; // e.g., 'activeUsers', 'sessions', 'eventCount', 'conversions'
  }>;
  dimensionFilter?: {
    filter?: {
      fieldName: string;
      stringFilter?: {
        value: string;
        matchType?: 'EXACT' | 'BEGINS_WITH' | 'ENDS_WITH' | 'CONTAINS';
      };
    };
  };
  metricFilter?: {
    filter?: {
      fieldName: string;
      numericFilter?: {
        value: {
          doubleValue?: number;
          int64Value?: string;
        };
        operation?: 'EQUAL' | 'LESS_THAN' | 'GREATER_THAN';
      };
    };
  };
  orderBys?: Array<{
    metric?: {
      metricName: string;
    };
    dimension?: {
      dimensionName: string;
    };
    desc?: boolean;
  }>;
  limit?: number;
  offset?: number;
}

export interface RunReportResponse {
  dimensionHeaders: Array<{ name: string }>;
  metricHeaders: Array<{ name: string; type: string }>;
  rows: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
  rowCount: number;
  metadata: {
    currencyCode?: string;
    timeZone?: string;
  };
}

/**
 * Internal run report function (unprotected)
 */
async function runReportInternal(
  options: RunReportOptions
): Promise<RunReportResponse> {
  if (!analyticsClient) {
    throw new Error('Google Analytics client not initialized. Set GOOGLE_ANALYTICS_CREDENTIALS.');
  }

  if (!GOOGLE_ANALYTICS_PROPERTY_ID) {
    throw new Error('GOOGLE_ANALYTICS_PROPERTY_ID not set.');
  }

  logger.info(
    {
      dateRanges: options.dateRanges,
      dimensionCount: options.dimensions?.length || 0,
      metricCount: options.metrics.length,
      hasFilters: !!(options.dimensionFilter || options.metricFilter),
    },
    'Running Google Analytics report'
  );

  const [response] = await analyticsClient.runReport({
    property: `properties/${GOOGLE_ANALYTICS_PROPERTY_ID}`,
    dateRanges: options.dateRanges,
    dimensions: options.dimensions,
    metrics: options.metrics,
    dimensionFilter: options.dimensionFilter as never,
    metricFilter: options.metricFilter as never,
    orderBys: options.orderBys as never,
    limit: options.limit,
    offset: options.offset,
  });

  logger.info(
    { rowCount: response.rowCount || 0 },
    'Google Analytics report completed'
  );

  return {
    dimensionHeaders: (response.dimensionHeaders || []).map((h) => ({
      name: h.name || '',
    })),
    metricHeaders: (response.metricHeaders || []).map((h) => ({
      name: h.name || '',
      type: String(h.type || ''),
    })),
    rows: (response.rows || []).map((row) => ({
      dimensionValues: (row.dimensionValues || []).map((v) => ({
        value: v.value || '',
      })),
      metricValues: (row.metricValues || []).map((v) => ({
        value: v.value || '',
      })),
    })),
    rowCount: Number(response.rowCount) || 0,
    metadata: {
      currencyCode: response.metadata?.currencyCode || undefined,
      timeZone: response.metadata?.timeZone || undefined,
    },
  };
}

/**
 * Run report (protected)
 */
const runReportWithBreaker = createCircuitBreaker(runReportInternal, {
  timeout: 15000,
  name: 'analytics-run-report',
});

const runReportRateLimited = withRateLimit(
  async (options: RunReportOptions) => runReportWithBreaker.fire(options),
  analyticsRateLimiter
);

export async function runReport(
  options: RunReportOptions
): Promise<RunReportResponse> {
  return (await runReportRateLimited(options)) as unknown as RunReportResponse;
}

export interface RealtimeReportOptions {
  dimensions?: Array<{
    name: string; // e.g., 'country', 'city', 'unifiedScreenName'
  }>;
  metrics: Array<{
    name: string; // e.g., 'activeUsers', 'screenPageViews', 'eventCount'
  }>;
  limit?: number;
  orderBys?: Array<{
    metric?: {
      metricName: string;
    };
    desc?: boolean;
  }>;
}

export interface RealtimeReportResponse {
  dimensionHeaders: Array<{ name: string }>;
  metricHeaders: Array<{ name: string; type: string }>;
  rows: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
  rowCount: number;
}

/**
 * Internal get realtime report function (unprotected)
 */
async function getRealtimeReportInternal(
  options: RealtimeReportOptions
): Promise<RealtimeReportResponse> {
  if (!analyticsClient) {
    throw new Error('Google Analytics client not initialized. Set GOOGLE_ANALYTICS_CREDENTIALS.');
  }

  if (!GOOGLE_ANALYTICS_PROPERTY_ID) {
    throw new Error('GOOGLE_ANALYTICS_PROPERTY_ID not set.');
  }

  logger.info(
    {
      dimensionCount: options.dimensions?.length || 0,
      metricCount: options.metrics.length,
    },
    'Getting Google Analytics realtime report'
  );

  const [response] = await analyticsClient.runRealtimeReport({
    property: `properties/${GOOGLE_ANALYTICS_PROPERTY_ID}`,
    dimensions: options.dimensions,
    metrics: options.metrics,
    limit: options.limit,
    orderBys: options.orderBys as never,
  });

  logger.info(
    { rowCount: response.rowCount || 0 },
    'Google Analytics realtime report completed'
  );

  return {
    dimensionHeaders: (response.dimensionHeaders || []).map((h) => ({
      name: h.name || '',
    })),
    metricHeaders: (response.metricHeaders || []).map((h) => ({
      name: h.name || '',
      type: String(h.type || ''),
    })),
    rows: (response.rows || []).map((row) => ({
      dimensionValues: (row.dimensionValues || []).map((v) => ({
        value: v.value || '',
      })),
      metricValues: (row.metricValues || []).map((v) => ({
        value: v.value || '',
      })),
    })),
    rowCount: Number(response.rowCount) || 0,
  };
}

/**
 * Get realtime report (protected)
 */
const getRealtimeReportWithBreaker = createCircuitBreaker(getRealtimeReportInternal, {
  timeout: 15000,
  name: 'analytics-realtime-report',
});

const getRealtimeReportRateLimited = withRateLimit(
  async (options: RealtimeReportOptions) => getRealtimeReportWithBreaker.fire(options),
  analyticsRateLimiter
);

export async function getRealtimeReport(
  options: RealtimeReportOptions
): Promise<RealtimeReportResponse> {
  return (await getRealtimeReportRateLimited(options)) as unknown as RealtimeReportResponse;
}

export interface MetadataResponse {
  dimensions: Array<{
    apiName: string;
    uiName: string;
    description: string;
    category: string;
  }>;
  metrics: Array<{
    apiName: string;
    uiName: string;
    description: string;
    category: string;
    type: string;
  }>;
}

/**
 * Internal get metadata function (unprotected)
 */
async function getMetadataInternal(): Promise<MetadataResponse> {
  if (!analyticsClient) {
    throw new Error('Google Analytics client not initialized. Set GOOGLE_ANALYTICS_CREDENTIALS.');
  }

  if (!GOOGLE_ANALYTICS_PROPERTY_ID) {
    throw new Error('GOOGLE_ANALYTICS_PROPERTY_ID not set.');
  }

  logger.info('Getting Google Analytics metadata');

  const [response] = await analyticsClient.getMetadata({
    name: `properties/${GOOGLE_ANALYTICS_PROPERTY_ID}/metadata`,
  });

  logger.info(
    {
      dimensionCount: response.dimensions?.length || 0,
      metricCount: response.metrics?.length || 0,
    },
    'Google Analytics metadata retrieved'
  );

  return {
    dimensions: (response.dimensions || []).map((d) => ({
      apiName: d.apiName || '',
      uiName: d.uiName || '',
      description: d.description || '',
      category: d.category || '',
    })),
    metrics: (response.metrics || []).map((m) => ({
      apiName: m.apiName || '',
      uiName: m.uiName || '',
      description: m.description || '',
      category: m.category || '',
      type: String(m.type || ''),
    })),
  };
}

/**
 * Get metadata (protected)
 */
const getMetadataWithBreaker = createCircuitBreaker(getMetadataInternal, {
  timeout: 15000,
  name: 'analytics-get-metadata',
});

const getMetadataRateLimited = withRateLimit(
  async () => getMetadataWithBreaker.fire(),
  analyticsRateLimiter
);

export async function getMetadata(): Promise<MetadataResponse> {
  return (await getMetadataRateLimited()) as unknown as MetadataResponse;
}

/**
 * Convenience function: Get top pages
 */
export async function getTopPages(
  dateRange: { startDate: string; endDate: string },
  limit = 10
): Promise<
  Array<{
    pageTitle: string;
    pagePath: string;
    views: string;
    users: string;
  }>
> {
  logger.info({ dateRange, limit }, 'Getting top pages from Google Analytics');

  const report = await runReport({
    dateRanges: [dateRange],
    dimensions: [{ name: 'pageTitle' }, { name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit,
  });

  return report.rows.map((row) => ({
    pageTitle: row.dimensionValues[0]?.value || '',
    pagePath: row.dimensionValues[1]?.value || '',
    views: row.metricValues[0]?.value || '0',
    users: row.metricValues[1]?.value || '0',
  }));
}

/**
 * Convenience function: Get top events
 */
export async function getTopEvents(
  dateRange: { startDate: string; endDate: string },
  limit = 10
): Promise<
  Array<{
    eventName: string;
    eventCount: string;
    users: string;
  }>
> {
  logger.info({ dateRange, limit }, 'Getting top events from Google Analytics');

  const report = await runReport({
    dateRanges: [dateRange],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit,
  });

  return report.rows.map((row) => ({
    eventName: row.dimensionValues[0]?.value || '',
    eventCount: row.metricValues[0]?.value || '0',
    users: row.metricValues[1]?.value || '0',
  }));
}

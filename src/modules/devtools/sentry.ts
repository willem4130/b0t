import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Sentry Module
 *
 * Error tracking and issue management
 * - Create issues
 * - Get issue details
 * - List issues
 * - Resolve issues
 * - Get project stats
 * - Built-in resilience
 *
 * Perfect for:
 * - Error tracking
 * - Bug management
 * - Production monitoring
 * - Performance monitoring
 */

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;

if (!SENTRY_AUTH_TOKEN) {
  logger.warn('⚠️  SENTRY_AUTH_TOKEN not set. Sentry features will not work.');
}

if (!SENTRY_ORG) {
  logger.warn('⚠️  SENTRY_ORG not set. Sentry features will not work.');
}

const SENTRY_API_BASE = 'https://sentry.io/api/0';

// Rate limiter: Sentry has rate limits of ~1000 req/min
const sentryRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 60, // 60ms = ~1000/min
  reservoir: 1000,
  reservoirRefreshAmount: 1000,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
  id: 'sentry',
});

export interface Issue {
  id: string;
  title: string;
  culprit: string;
  type: string;
  level: string;
  status: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
}

export interface Event {
  id: string;
  message: string;
  dateCreated: string;
  platform: string;
  tags: Array<{ key: string; value: string }>;
  user: {
    id: string;
    email: string;
    username: string;
  } | null;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  platform: string;
  dateCreated: string;
}

/**
 * Internal function to make Sentry API request
 */
async function sentryRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: unknown
): Promise<T> {
  if (!SENTRY_AUTH_TOKEN) {
    throw new Error('Sentry auth token not set. Set SENTRY_AUTH_TOKEN.');
  }

  const url = `${SENTRY_API_BASE}${endpoint}`;

  logger.info({ method, endpoint }, 'Making Sentry API request');

  const response = await axios({
    method,
    url,
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    data,
  });

  logger.info({ method, endpoint, status: response.status }, 'Sentry API request successful');

  return response.data as T;
}

/**
 * List issues
 */
async function listIssuesInternal(
  projectSlug: string,
  options?: {
    query?: string;
    statsPeriod?: string;
    status?: 'resolved' | 'unresolved' | 'ignored';
    limit?: number;
  }
): Promise<Issue[]> {
  if (!SENTRY_ORG) {
    throw new Error('Sentry organization not set. Set SENTRY_ORG.');
  }

  logger.info({ projectSlug, options }, 'Listing Sentry issues');

  const params = new URLSearchParams();
  if (options?.query) params.append('query', options.query);
  if (options?.statsPeriod) params.append('statsPeriod', options.statsPeriod);
  if (options?.status) params.append('query', `is:${options.status}`);
  if (options?.limit) params.append('limit', options.limit.toString());

  const queryString = params.toString();
  const endpoint = `/projects/${SENTRY_ORG}/${projectSlug}/issues/${queryString ? `?${queryString}` : ''}`;

  const response = await sentryRequest<
    Array<{
      id: string;
      title: string;
      culprit: string;
      type: string;
      level: string;
      status: string;
      count: string;
      userCount: number;
      firstSeen: string;
      lastSeen: string;
      permalink: string;
    }>
  >('GET', endpoint);

  logger.info({ issueCount: response.length }, 'Issues listed');

  return response.map((issue) => ({
    id: issue.id,
    title: issue.title,
    culprit: issue.culprit,
    type: issue.type,
    level: issue.level,
    status: issue.status,
    count: issue.count,
    userCount: issue.userCount,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    permalink: issue.permalink,
  }));
}

const listIssuesWithBreaker = createCircuitBreaker(listIssuesInternal, {
  timeout: 15000,
  name: 'sentry-list-issues',
});

const listIssuesRateLimited = withRateLimit(
  async (
    projectSlug: string,
    options?: {
      query?: string;
      statsPeriod?: string;
      status?: 'resolved' | 'unresolved' | 'ignored';
      limit?: number;
    }
  ) => listIssuesWithBreaker.fire(projectSlug, options),
  sentryRateLimiter
);

export async function listIssues(
  projectSlug: string,
  options?: {
    query?: string;
    statsPeriod?: string;
    status?: 'resolved' | 'unresolved' | 'ignored';
    limit?: number;
  }
): Promise<Issue[]> {
  return (await listIssuesRateLimited(projectSlug, options)) as Issue[];
}

/**
 * Get issue
 */
export async function getIssue(issueId: string): Promise<Issue> {
  logger.info({ issueId }, 'Getting Sentry issue');

  const response = await sentryRequest<{
    id: string;
    title: string;
    culprit: string;
    type: string;
    level: string;
    status: string;
    count: string;
    userCount: number;
    firstSeen: string;
    lastSeen: string;
    permalink: string;
  }>('GET', `/issues/${issueId}/`);

  logger.info({ issueId, status: response.status }, 'Issue retrieved');

  return {
    id: response.id,
    title: response.title,
    culprit: response.culprit,
    type: response.type,
    level: response.level,
    status: response.status,
    count: response.count,
    userCount: response.userCount,
    firstSeen: response.firstSeen,
    lastSeen: response.lastSeen,
    permalink: response.permalink,
  };
}

/**
 * Update issue (resolve, ignore, etc.)
 */
export async function updateIssue(
  issueId: string,
  update: {
    status?: 'resolved' | 'unresolved' | 'ignored';
    assignedTo?: string;
  }
): Promise<Issue> {
  logger.info({ issueId, update }, 'Updating Sentry issue');

  const response = await sentryRequest<{
    id: string;
    title: string;
    culprit: string;
    type: string;
    level: string;
    status: string;
    count: string;
    userCount: number;
    firstSeen: string;
    lastSeen: string;
    permalink: string;
  }>('PUT', `/issues/${issueId}/`, update);

  logger.info({ issueId, newStatus: response.status }, 'Issue updated');

  return {
    id: response.id,
    title: response.title,
    culprit: response.culprit,
    type: response.type,
    level: response.level,
    status: response.status,
    count: response.count,
    userCount: response.userCount,
    firstSeen: response.firstSeen,
    lastSeen: response.lastSeen,
    permalink: response.permalink,
  };
}

/**
 * Resolve issue (convenience function)
 */
export async function resolveIssue(issueId: string): Promise<Issue> {
  logger.info({ issueId }, 'Resolving Sentry issue');
  return updateIssue(issueId, { status: 'resolved' });
}

/**
 * Delete issue
 */
export async function deleteIssue(issueId: string): Promise<{ message: string }> {
  logger.info({ issueId }, 'Deleting Sentry issue');

  await sentryRequest('DELETE', `/issues/${issueId}/`);

  logger.info({ issueId }, 'Issue deleted');

  return { message: 'Issue deleted successfully' };
}

/**
 * List events for an issue
 */
export async function listIssueEvents(
  issueId: string,
  limit: number = 100
): Promise<Event[]> {
  logger.info({ issueId, limit }, 'Listing issue events');

  const params = new URLSearchParams({ limit: limit.toString() });
  const endpoint = `/issues/${issueId}/events/?${params.toString()}`;

  const response = await sentryRequest<
    Array<{
      id: string;
      message: string;
      dateCreated: string;
      platform: string;
      tags: Array<{ key: string; value: string }>;
      user: {
        id: string;
        email: string;
        username: string;
      } | null;
    }>
  >('GET', endpoint);

  logger.info({ eventCount: response.length }, 'Events listed');

  return response.map((event) => ({
    id: event.id,
    message: event.message,
    dateCreated: event.dateCreated,
    platform: event.platform,
    tags: event.tags,
    user: event.user,
  }));
}

/**
 * Get latest event for issue
 */
export async function getLatestEvent(issueId: string): Promise<Event> {
  logger.info({ issueId }, 'Getting latest event');

  const response = await sentryRequest<{
    id: string;
    message: string;
    dateCreated: string;
    platform: string;
    tags: Array<{ key: string; value: string }>;
    user: {
      id: string;
      email: string;
      username: string;
    } | null;
  }>('GET', `/issues/${issueId}/events/latest/`);

  logger.info({ eventId: response.id }, 'Latest event retrieved');

  return {
    id: response.id,
    message: response.message,
    dateCreated: response.dateCreated,
    platform: response.platform,
    tags: response.tags,
    user: response.user,
  };
}

/**
 * List projects
 */
export async function listProjects(): Promise<Project[]> {
  if (!SENTRY_ORG) {
    throw new Error('Sentry organization not set. Set SENTRY_ORG.');
  }

  logger.info('Listing Sentry projects');

  const response = await sentryRequest<
    Array<{
      id: string;
      name: string;
      slug: string;
      platform: string;
      dateCreated: string;
    }>
  >('GET', `/organizations/${SENTRY_ORG}/projects/`);

  logger.info({ projectCount: response.length }, 'Projects listed');

  return response.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    platform: project.platform,
    dateCreated: project.dateCreated,
  }));
}

/**
 * Get project
 */
export async function getProject(projectSlug: string): Promise<Project> {
  if (!SENTRY_ORG) {
    throw new Error('Sentry organization not set. Set SENTRY_ORG.');
  }

  logger.info({ projectSlug }, 'Getting Sentry project');

  const response = await sentryRequest<{
    id: string;
    name: string;
    slug: string;
    platform: string;
    dateCreated: string;
  }>('GET', `/projects/${SENTRY_ORG}/${projectSlug}/`);

  logger.info({ projectSlug }, 'Project retrieved');

  return {
    id: response.id,
    name: response.name,
    slug: response.slug,
    platform: response.platform,
    dateCreated: response.dateCreated,
  };
}

/**
 * Get project stats
 */
export async function getProjectStats(
  projectSlug: string,
  stat: 'received' | 'rejected' | 'blacklisted' = 'received',
  since?: number,
  until?: number
): Promise<Array<[number, number]>> {
  if (!SENTRY_ORG) {
    throw new Error('Sentry organization not set. Set SENTRY_ORG.');
  }

  logger.info({ projectSlug, stat, since, until }, 'Getting project stats');

  const params = new URLSearchParams({ stat });
  if (since) params.append('since', since.toString());
  if (until) params.append('until', until.toString());

  const queryString = params.toString();
  const endpoint = `/projects/${SENTRY_ORG}/${projectSlug}/stats/?${queryString}`;

  const response = await sentryRequest<Array<[number, number]>>('GET', endpoint);

  logger.info({ dataPoints: response.length }, 'Project stats retrieved');

  return response;
}

/**
 * Bulk update issues
 */
export async function bulkUpdateIssues(
  issueIds: string[],
  update: {
    status?: 'resolved' | 'unresolved' | 'ignored';
  }
): Promise<{ message: string }> {
  logger.info({ issueCount: issueIds.length, update }, 'Bulk updating issues');

  await sentryRequest('PUT', '/issues/', {
    ...update,
    id: issueIds,
  });

  logger.info({ issueCount: issueIds.length }, 'Issues updated');

  return { message: `${issueIds.length} issues updated successfully` };
}

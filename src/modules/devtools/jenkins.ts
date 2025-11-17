import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Jenkins Module
 *
 * Manage Jenkins builds and jobs
 * - Trigger builds
 * - Get build status
 * - Get job information
 * - Get console output
 * - Stop builds
 * - Built-in resilience
 *
 * Perfect for:
 * - CI/CD automation
 * - Build orchestration
 * - Deployment pipelines
 * - Build monitoring
 */

const JENKINS_URL = process.env.JENKINS_URL;
const JENKINS_USER = process.env.JENKINS_USER;
const JENKINS_TOKEN = process.env.JENKINS_TOKEN;

if (!JENKINS_URL || !JENKINS_USER || !JENKINS_TOKEN) {
  logger.warn(
    '⚠️  JENKINS_URL, JENKINS_USER, or JENKINS_TOKEN not set. Jenkins features will not work.'
  );
}

// Rate limiter: Conservative 60 requests per minute
const jenkinsRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 1000, // 1 second between requests
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
  id: 'jenkins',
});

export interface Build {
  number: number;
  url: string;
  result: string | null;
  building: boolean;
  duration: number;
  timestamp: number;
  estimatedDuration: number;
}

export interface Job {
  name: string;
  url: string;
  color: string;
  buildable: boolean;
  lastBuild: {
    number: number;
    url: string;
  } | null;
}

/**
 * Internal function to make Jenkins API request
 */
async function jenkinsRequest<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  data?: unknown
): Promise<T> {
  if (!JENKINS_URL || !JENKINS_USER || !JENKINS_TOKEN) {
    throw new Error('Jenkins credentials not set. Set JENKINS_URL, JENKINS_USER, and JENKINS_TOKEN.');
  }

  const url = `${JENKINS_URL}${endpoint}`;
  const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString('base64');

  logger.info({ method, endpoint }, 'Making Jenkins API request');

  const response = await axios({
    method,
    url,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    data,
  });

  logger.info({ method, endpoint, status: response.status }, 'Jenkins API request successful');

  return response.data as T;
}

/**
 * Trigger build
 */
async function triggerBuildInternal(
  jobName: string,
  parameters?: Record<string, string>
): Promise<{ queueId: number }> {
  logger.info({ jobName, parameters }, 'Triggering Jenkins build');

  const endpoint = parameters
    ? `/job/${jobName}/buildWithParameters`
    : `/job/${jobName}/build`;

  // Jenkins returns 201 on success but doesn't return JSON, so we handle it specially
  if (!JENKINS_URL || !JENKINS_USER || !JENKINS_TOKEN) {
    throw new Error('Jenkins credentials not set.');
  }

  const url = `${JENKINS_URL}${endpoint}`;
  const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString('base64');

  const response = await axios({
    method: 'POST',
    url,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    params: parameters,
    maxRedirects: 0,
    validateStatus: (status) => status === 201,
  });

  // Extract queue ID from Location header
  const location = response.headers['location'] || '';
  const queueId = parseInt(location.split('/').slice(-2, -1)[0] || '0', 10);

  logger.info({ jobName, queueId }, 'Build triggered successfully');

  return { queueId };
}

const triggerBuildWithBreaker = createCircuitBreaker(triggerBuildInternal, {
  timeout: 15000,
  name: 'jenkins-trigger-build',
});

const triggerBuildRateLimited = withRateLimit(
  async (jobName: string, parameters?: Record<string, string>) =>
    triggerBuildWithBreaker.fire(jobName, parameters),
  jenkinsRateLimiter
);

export async function triggerBuild(
  jobName: string,
  parameters?: Record<string, string>
): Promise<{ queueId: number }> {
  return (await triggerBuildRateLimited(jobName, parameters)) as { queueId: number };
}

/**
 * Get build status
 */
export async function getBuildStatus(
  jobName: string,
  buildNumber: number
): Promise<Build> {
  logger.info({ jobName, buildNumber }, 'Getting Jenkins build status');

  const response = await jenkinsRequest<{
    number: number;
    url: string;
    result: string | null;
    building: boolean;
    duration: number;
    timestamp: number;
    estimatedDuration: number;
  }>('GET', `/job/${jobName}/${buildNumber}/api/json`);

  logger.info({ jobName, buildNumber, result: response.result }, 'Build status retrieved');

  return {
    number: response.number,
    url: response.url,
    result: response.result,
    building: response.building,
    duration: response.duration,
    timestamp: response.timestamp,
    estimatedDuration: response.estimatedDuration,
  };
}

/**
 * Get last build
 */
export async function getLastBuild(jobName: string): Promise<Build> {
  logger.info({ jobName }, 'Getting last Jenkins build');

  const response = await jenkinsRequest<{
    number: number;
    url: string;
    result: string | null;
    building: boolean;
    duration: number;
    timestamp: number;
    estimatedDuration: number;
  }>('GET', `/job/${jobName}/lastBuild/api/json`);

  logger.info({ jobName, buildNumber: response.number }, 'Last build retrieved');

  return {
    number: response.number,
    url: response.url,
    result: response.result,
    building: response.building,
    duration: response.duration,
    timestamp: response.timestamp,
    estimatedDuration: response.estimatedDuration,
  };
}

/**
 * Get job info
 */
export async function getJobInfo(jobName: string): Promise<Job> {
  logger.info({ jobName }, 'Getting Jenkins job info');

  const response = await jenkinsRequest<{
    name: string;
    url: string;
    color: string;
    buildable: boolean;
    lastBuild: {
      number: number;
      url: string;
    } | null;
  }>('GET', `/job/${jobName}/api/json`);

  logger.info({ jobName }, 'Job info retrieved');

  return {
    name: response.name,
    url: response.url,
    color: response.color,
    buildable: response.buildable,
    lastBuild: response.lastBuild,
  };
}

/**
 * Get console output
 */
export async function getConsoleOutput(
  jobName: string,
  buildNumber: number
): Promise<{ text: string }> {
  logger.info({ jobName, buildNumber }, 'Getting console output');

  if (!JENKINS_URL || !JENKINS_USER || !JENKINS_TOKEN) {
    throw new Error('Jenkins credentials not set.');
  }

  const url = `${JENKINS_URL}/job/${jobName}/${buildNumber}/consoleText`;
  const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString('base64');

  const response = await axios({
    method: 'GET',
    url,
    headers: {
      Authorization: `Basic ${auth}`,
    },
    responseType: 'text',
  });

  logger.info({ jobName, buildNumber, length: response.data.length }, 'Console output retrieved');

  return { text: response.data as string };
}

/**
 * Stop build
 */
export async function stopBuild(
  jobName: string,
  buildNumber: number
): Promise<{ message: string }> {
  logger.info({ jobName, buildNumber }, 'Stopping Jenkins build');

  await jenkinsRequest('POST', `/job/${jobName}/${buildNumber}/stop`);

  logger.info({ jobName, buildNumber }, 'Build stopped');

  return { message: `Build ${buildNumber} stopped successfully` };
}

/**
 * List jobs
 */
export async function listJobs(): Promise<Job[]> {
  logger.info('Listing Jenkins jobs');

  const response = await jenkinsRequest<{
    jobs: Array<{
      name: string;
      url: string;
      color: string;
      buildable: boolean;
      lastBuild: {
        number: number;
        url: string;
      } | null;
    }>;
  }>('GET', '/api/json?tree=jobs[name,url,color,buildable,lastBuild[number,url]]');

  logger.info({ jobCount: response.jobs.length }, 'Jobs listed');

  return response.jobs.map((job) => ({
    name: job.name,
    url: job.url,
    color: job.color,
    buildable: job.buildable,
    lastBuild: job.lastBuild,
  }));
}

/**
 * Get queue item
 */
export async function getQueueItem(queueId: number): Promise<{
  id: number;
  blocked: boolean;
  buildable: boolean;
  stuck: boolean;
  executable: {
    number: number;
    url: string;
  } | null;
}> {
  logger.info({ queueId }, 'Getting queue item');

  const response = await jenkinsRequest<{
    id: number;
    blocked: boolean;
    buildable: boolean;
    stuck: boolean;
    executable: {
      number: number;
      url: string;
    } | null;
  }>('GET', `/queue/item/${queueId}/api/json`);

  logger.info({ queueId, executable: response.executable }, 'Queue item retrieved');

  return {
    id: response.id,
    blocked: response.blocked,
    buildable: response.buildable,
    stuck: response.stuck,
    executable: response.executable,
  };
}

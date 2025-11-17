import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Heroku Module
 *
 * Manage Heroku applications and deployments
 * - Create and manage apps
 * - Deploy applications
 * - Get app information
 * - Get logs
 * - Scale dynos
 * - Manage config vars
 * - Built-in resilience
 *
 * Perfect for:
 * - Application deployment
 * - Cloud hosting automation
 * - Scaling management
 * - Configuration management
 */

const HEROKU_API_KEY = process.env.HEROKU_API_KEY;

if (!HEROKU_API_KEY) {
  logger.warn('⚠️  HEROKU_API_KEY not set. Heroku features will not work.');
}

const HEROKU_API_BASE = 'https://api.heroku.com';

// Rate limiter: Heroku has 4500 req/hour = 75 req/min
const herokuRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 800, // 800ms = ~75/min
  reservoir: 75,
  reservoirRefreshAmount: 75,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
  id: 'heroku',
});

export interface App {
  id: string;
  name: string;
  region: string;
  stack: string;
  createdAt: string;
  webUrl: string;
  gitUrl: string;
}

export interface Dyno {
  id: string;
  name: string;
  type: string;
  size: string;
  state: string;
  command: string;
}

export interface Build {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceBlob: {
    url: string;
    version: string;
  };
}

/**
 * Internal function to make Heroku API request
 */
async function herokuRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  endpoint: string,
  data?: unknown
): Promise<T> {
  if (!HEROKU_API_KEY) {
    throw new Error('Heroku API key not set. Set HEROKU_API_KEY.');
  }

  const url = `${HEROKU_API_BASE}${endpoint}`;

  logger.info({ method, endpoint }, 'Making Heroku API request');

  const response = await axios({
    method,
    url,
    headers: {
      Authorization: `Bearer ${HEROKU_API_KEY}`,
      Accept: 'application/vnd.heroku+json; version=3',
      'Content-Type': 'application/json',
    },
    data,
  });

  logger.info({ method, endpoint, status: response.status }, 'Heroku API request successful');

  return response.data as T;
}

/**
 * Create app
 */
async function createAppInternal(
  name?: string,
  options?: {
    region?: string;
    stack?: string;
  }
): Promise<App> {
  logger.info({ name, options }, 'Creating Heroku app');

  const payload: {
    name?: string;
    region?: string;
    stack?: string;
  } = {};

  if (name) payload.name = name;
  if (options?.region) payload.region = options.region;
  if (options?.stack) payload.stack = options.stack;

  const response = await herokuRequest<{
    id: string;
    name: string;
    region: { name: string };
    stack: { name: string };
    created_at: string;
    web_url: string;
    git_url: string;
  }>('POST', '/apps', payload);

  logger.info({ appId: response.id, appName: response.name }, 'Heroku app created');

  return {
    id: response.id,
    name: response.name,
    region: response.region.name,
    stack: response.stack.name,
    createdAt: response.created_at,
    webUrl: response.web_url,
    gitUrl: response.git_url,
  };
}

const createAppWithBreaker = createCircuitBreaker(createAppInternal, {
  timeout: 20000,
  name: 'heroku-create-app',
});

const createAppRateLimited = withRateLimit(
  async (
    name?: string,
    options?: {
      region?: string;
      stack?: string;
    }
  ) => createAppWithBreaker.fire(name, options),
  herokuRateLimiter
);

export async function createApp(
  name?: string,
  options?: {
    region?: string;
    stack?: string;
  }
): Promise<App> {
  return (await createAppRateLimited(name, options)) as App;
}

/**
 * Get app info
 */
export async function getAppInfo(appName: string): Promise<App> {
  logger.info({ appName }, 'Getting Heroku app info');

  const response = await herokuRequest<{
    id: string;
    name: string;
    region: { name: string };
    stack: { name: string };
    created_at: string;
    web_url: string;
    git_url: string;
  }>('GET', `/apps/${appName}`);

  logger.info({ appName }, 'App info retrieved');

  return {
    id: response.id,
    name: response.name,
    region: response.region.name,
    stack: response.stack.name,
    createdAt: response.created_at,
    webUrl: response.web_url,
    gitUrl: response.git_url,
  };
}

/**
 * List apps
 */
export async function listApps(): Promise<App[]> {
  logger.info('Listing Heroku apps');

  const response = await herokuRequest<
    Array<{
      id: string;
      name: string;
      region: { name: string };
      stack: { name: string };
      created_at: string;
      web_url: string;
      git_url: string;
    }>
  >('GET', '/apps');

  logger.info({ appCount: response.length }, 'Apps listed');

  return response.map((app) => ({
    id: app.id,
    name: app.name,
    region: app.region.name,
    stack: app.stack.name,
    createdAt: app.created_at,
    webUrl: app.web_url,
    gitUrl: app.git_url,
  }));
}

/**
 * Delete app
 */
export async function deleteApp(appName: string): Promise<{ message: string }> {
  logger.info({ appName }, 'Deleting Heroku app');

  await herokuRequest('DELETE', `/apps/${appName}`);

  logger.info({ appName }, 'App deleted');

  return { message: `App ${appName} deleted successfully` };
}

/**
 * Create build (deploy)
 */
export async function deployApp(
  appName: string,
  sourceUrl: string,
  version?: string
): Promise<Build> {
  logger.info({ appName, sourceUrl, version }, 'Deploying Heroku app');

  const payload = {
    source_blob: {
      url: sourceUrl,
      version: version || 'main',
    },
  };

  const response = await herokuRequest<{
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    source_blob: {
      url: string;
      version: string;
    };
  }>('POST', `/apps/${appName}/builds`, payload);

  logger.info({ buildId: response.id, status: response.status }, 'Build created');

  return {
    id: response.id,
    status: response.status,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    sourceBlob: response.source_blob,
  };
}

/**
 * Get build status
 */
export async function getBuildStatus(appName: string, buildId: string): Promise<Build> {
  logger.info({ appName, buildId }, 'Getting build status');

  const response = await herokuRequest<{
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    source_blob: {
      url: string;
      version: string;
    };
  }>('GET', `/apps/${appName}/builds/${buildId}`);

  logger.info({ buildId, status: response.status }, 'Build status retrieved');

  return {
    id: response.id,
    status: response.status,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    sourceBlob: response.source_blob,
  };
}

/**
 * Get logs
 */
export async function getLogs(
  appName: string,
  options?: {
    lines?: number;
    source?: string;
    dyno?: string;
    tail?: boolean;
  }
): Promise<{ logUrl: string }> {
  logger.info({ appName, options }, 'Getting Heroku logs');

  const params: {
    lines?: number;
    source?: string;
    dyno?: string;
    tail?: boolean;
  } = {};

  if (options?.lines) params.lines = options.lines;
  if (options?.source) params.source = options.source;
  if (options?.dyno) params.dyno = options.dyno;
  if (options?.tail) params.tail = options.tail;

  const response = await herokuRequest<{ logplex_url: string }>(
    'POST',
    `/apps/${appName}/log-sessions`,
    params
  );

  logger.info({ appName }, 'Log URL retrieved');

  return { logUrl: response.logplex_url };
}

/**
 * Scale dynos
 */
export async function scaleDynos(
  appName: string,
  dynoType: string,
  quantity: number,
  size?: string
): Promise<Dyno> {
  logger.info({ appName, dynoType, quantity, size }, 'Scaling Heroku dynos');

  const payload: {
    quantity: number;
    size?: string;
  } = { quantity };

  if (size) payload.size = size;

  const response = await herokuRequest<{
    id: string;
    name: string;
    type: string;
    size: string;
    state: string;
    command: string;
  }>('PATCH', `/apps/${appName}/formation/${dynoType}`, payload);

  logger.info({ appName, dynoType, quantity }, 'Dynos scaled');

  return {
    id: response.id,
    name: response.name,
    type: response.type,
    size: response.size,
    state: response.state,
    command: response.command,
  };
}

/**
 * List dynos
 */
export async function listDynos(appName: string): Promise<Dyno[]> {
  logger.info({ appName }, 'Listing Heroku dynos');

  const response = await herokuRequest<
    Array<{
      id: string;
      name: string;
      type: string;
      size: string;
      state: string;
      command: string;
    }>
  >('GET', `/apps/${appName}/dynos`);

  logger.info({ appName, dynoCount: response.length }, 'Dynos listed');

  return response.map((dyno) => ({
    id: dyno.id,
    name: dyno.name,
    type: dyno.type,
    size: dyno.size,
    state: dyno.state,
    command: dyno.command,
  }));
}

/**
 * Get config vars
 */
export async function getConfigVars(appName: string): Promise<Record<string, string>> {
  logger.info({ appName }, 'Getting config vars');

  const response = await herokuRequest<Record<string, string>>('GET', `/apps/${appName}/config-vars`);

  logger.info({ appName, varCount: Object.keys(response).length }, 'Config vars retrieved');

  return response;
}

/**
 * Update config vars
 */
export async function updateConfigVars(
  appName: string,
  configVars: Record<string, string>
): Promise<Record<string, string>> {
  logger.info({ appName, varCount: Object.keys(configVars).length }, 'Updating config vars');

  const response = await herokuRequest<Record<string, string>>(
    'PATCH',
    `/apps/${appName}/config-vars`,
    configVars
  );

  logger.info({ appName }, 'Config vars updated');

  return response;
}

/**
 * Restart app
 */
export async function restartApp(appName: string): Promise<{ message: string }> {
  logger.info({ appName }, 'Restarting Heroku app');

  await herokuRequest('DELETE', `/apps/${appName}/dynos`);

  logger.info({ appName }, 'App restarted');

  return { message: `App ${appName} restarted successfully` };
}

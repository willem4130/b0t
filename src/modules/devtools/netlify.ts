import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Netlify Module
 *
 * Manage Netlify sites and deployments
 * - Create deployments
 * - Get site information
 * - List deploys
 * - Get deploy logs
 * - Manage domains
 * - Built-in resilience
 *
 * Perfect for:
 * - Static site deployments
 * - JAMstack applications
 * - Preview environments
 * - Continuous deployment
 */

const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

if (!NETLIFY_TOKEN) {
  logger.warn('⚠️  NETLIFY_TOKEN not set. Netlify features will not work.');
}

const NETLIFY_API_BASE = 'https://api.netlify.com/api/v1';

// Rate limiter: Netlify has 500 req/min rate limit
const netlifyRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 120, // 120ms = ~500/min
  reservoir: 500,
  reservoirRefreshAmount: 500,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
  id: 'netlify',
});

export interface Deploy {
  id: string;
  siteId: string;
  url: string;
  state: string;
  createdAt: string;
  deployTime: number;
  branch: string;
  commitRef: string;
}

export interface Site {
  id: string;
  name: string;
  url: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Internal function to make Netlify API request
 */
async function netlifyRequest<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PUT',
  endpoint: string,
  data?: unknown
): Promise<T> {
  if (!NETLIFY_TOKEN) {
    throw new Error('Netlify token not set. Set NETLIFY_TOKEN.');
  }

  const url = `${NETLIFY_API_BASE}${endpoint}`;

  logger.info({ method, endpoint }, 'Making Netlify API request');

  const response = await axios({
    method,
    url,
    headers: {
      Authorization: `Bearer ${NETLIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    data,
  });

  logger.info({ method, endpoint, status: response.status }, 'Netlify API request successful');

  return response.data as T;
}

/**
 * Create deployment
 */
async function createDeploymentInternal(
  siteId: string,
  options?: {
    title?: string;
    branch?: string;
    files?: Record<string, string>;
  }
): Promise<Deploy> {
  logger.info({ siteId, options }, 'Creating Netlify deployment');

  const payload: {
    title?: string;
    branch?: string;
    files?: Record<string, string>;
  } = {};

  if (options?.title) payload.title = options.title;
  if (options?.branch) payload.branch = options.branch;
  if (options?.files) payload.files = options.files;

  const response = await netlifyRequest<{
    id: string;
    site_id: string;
    deploy_ssl_url: string;
    state: string;
    created_at: string;
    deploy_time: number;
    branch: string;
    commit_ref: string;
  }>('POST', `/sites/${siteId}/deploys`, payload);

  logger.info({ deployId: response.id, url: response.deploy_ssl_url }, 'Deployment created');

  return {
    id: response.id,
    siteId: response.site_id,
    url: response.deploy_ssl_url,
    state: response.state,
    createdAt: response.created_at,
    deployTime: response.deploy_time,
    branch: response.branch,
    commitRef: response.commit_ref,
  };
}

const createDeploymentWithBreaker = createCircuitBreaker(createDeploymentInternal, {
  timeout: 30000, // Deployments can take longer
  name: 'netlify-create-deployment',
});

const createDeploymentRateLimited = withRateLimit(
  async (
    siteId: string,
    options?: {
      title?: string;
      branch?: string;
      files?: Record<string, string>;
    }
  ) => createDeploymentWithBreaker.fire(siteId, options),
  netlifyRateLimiter
);

export async function createDeployment(
  siteId: string,
  options?: {
    title?: string;
    branch?: string;
    files?: Record<string, string>;
  }
): Promise<Deploy> {
  return (await createDeploymentRateLimited(siteId, options)) as Deploy;
}

/**
 * Get site
 */
export async function getSite(siteId: string): Promise<Site> {
  logger.info({ siteId }, 'Getting Netlify site');

  const response = await netlifyRequest<{
    id: string;
    name: string;
    url: string;
    state: string;
    created_at: string;
    updated_at: string;
  }>('GET', `/sites/${siteId}`);

  logger.info({ siteId, name: response.name }, 'Site retrieved');

  return {
    id: response.id,
    name: response.name,
    url: response.url,
    state: response.state,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

/**
 * List sites
 */
export async function listSites(options?: {
  name?: string;
  page?: number;
  perPage?: number;
}): Promise<Site[]> {
  logger.info({ options }, 'Listing Netlify sites');

  const params = new URLSearchParams();
  if (options?.name) params.append('name', options.name);
  if (options?.page) params.append('page', options.page.toString());
  if (options?.perPage) params.append('per_page', options.perPage.toString());

  const queryString = params.toString();
  const endpoint = `/sites${queryString ? `?${queryString}` : ''}`;

  const response = await netlifyRequest<
    Array<{
      id: string;
      name: string;
      url: string;
      state: string;
      created_at: string;
      updated_at: string;
    }>
  >('GET', endpoint);

  logger.info({ siteCount: response.length }, 'Sites listed');

  return response.map((site) => ({
    id: site.id,
    name: site.name,
    url: site.url,
    state: site.state,
    createdAt: site.created_at,
    updatedAt: site.updated_at,
  }));
}

/**
 * List deploys
 */
export async function listDeploys(
  siteId: string,
  options?: {
    state?: 'ready' | 'error' | 'building';
    branch?: string;
    page?: number;
    perPage?: number;
  }
): Promise<Deploy[]> {
  logger.info({ siteId, options }, 'Listing Netlify deploys');

  const params = new URLSearchParams();
  if (options?.state) params.append('state', options.state);
  if (options?.branch) params.append('branch', options.branch);
  if (options?.page) params.append('page', options.page.toString());
  if (options?.perPage) params.append('per_page', options.perPage.toString());

  const queryString = params.toString();
  const endpoint = `/sites/${siteId}/deploys${queryString ? `?${queryString}` : ''}`;

  const response = await netlifyRequest<
    Array<{
      id: string;
      site_id: string;
      deploy_ssl_url: string;
      state: string;
      created_at: string;
      deploy_time: number;
      branch: string;
      commit_ref: string;
    }>
  >('GET', endpoint);

  logger.info({ deployCount: response.length }, 'Deploys listed');

  return response.map((deploy) => ({
    id: deploy.id,
    siteId: deploy.site_id,
    url: deploy.deploy_ssl_url,
    state: deploy.state,
    createdAt: deploy.created_at,
    deployTime: deploy.deploy_time,
    branch: deploy.branch,
    commitRef: deploy.commit_ref,
  }));
}

/**
 * Get deploy
 */
export async function getDeploy(deployId: string): Promise<Deploy> {
  logger.info({ deployId }, 'Getting Netlify deploy');

  const response = await netlifyRequest<{
    id: string;
    site_id: string;
    deploy_ssl_url: string;
    state: string;
    created_at: string;
    deploy_time: number;
    branch: string;
    commit_ref: string;
  }>('GET', `/deploys/${deployId}`);

  logger.info({ deployId, state: response.state }, 'Deploy retrieved');

  return {
    id: response.id,
    siteId: response.site_id,
    url: response.deploy_ssl_url,
    state: response.state,
    createdAt: response.created_at,
    deployTime: response.deploy_time,
    branch: response.branch,
    commitRef: response.commit_ref,
  };
}

/**
 * Cancel deploy
 */
export async function cancelDeploy(deployId: string): Promise<{ message: string }> {
  logger.info({ deployId }, 'Canceling Netlify deploy');

  await netlifyRequest('POST', `/deploys/${deployId}/cancel`);

  logger.info({ deployId }, 'Deploy canceled');

  return { message: 'Deploy canceled successfully' };
}

/**
 * Restore deploy (roll back to a previous deploy)
 */
export async function restoreDeploy(siteId: string, deployId: string): Promise<Deploy> {
  logger.info({ siteId, deployId }, 'Restoring Netlify deploy');

  const response = await netlifyRequest<{
    id: string;
    site_id: string;
    deploy_ssl_url: string;
    state: string;
    created_at: string;
    deploy_time: number;
    branch: string;
    commit_ref: string;
  }>('POST', `/sites/${siteId}/deploys/${deployId}/restore`);

  logger.info({ newDeployId: response.id }, 'Deploy restored');

  return {
    id: response.id,
    siteId: response.site_id,
    url: response.deploy_ssl_url,
    state: response.state,
    createdAt: response.created_at,
    deployTime: response.deploy_time,
    branch: response.branch,
    commitRef: response.commit_ref,
  };
}

/**
 * Get deploy log
 */
export async function getDeployLog(deployId: string): Promise<{ messages: string[] }> {
  logger.info({ deployId }, 'Getting deploy log');

  const response = await netlifyRequest<
    Array<{
      message: string;
      error: boolean;
    }>
  >('GET', `/deploys/${deployId}/log`);

  logger.info({ deployId, logCount: response.length }, 'Deploy log retrieved');

  return {
    messages: response.map((entry) => entry.message),
  };
}

/**
 * Trigger new deploy (rebuild)
 */
export async function triggerDeploy(siteId: string): Promise<Deploy> {
  logger.info({ siteId }, 'Triggering new deploy');

  const response = await netlifyRequest<{
    id: string;
    site_id: string;
    deploy_ssl_url: string;
    state: string;
    created_at: string;
    deploy_time: number;
    branch: string;
    commit_ref: string;
  }>('POST', `/sites/${siteId}/builds`);

  logger.info({ deployId: response.id }, 'Deploy triggered');

  return {
    id: response.id,
    siteId: response.site_id,
    url: response.deploy_ssl_url,
    state: response.state,
    createdAt: response.created_at,
    deployTime: response.deploy_time,
    branch: response.branch,
    commitRef: response.commit_ref,
  };
}

import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Vercel Module
 *
 * Manage Vercel deployments and projects
 * - Create deployments
 * - Get deployment status
 * - List deployments
 * - Get deployment logs
 * - Manage domains
 * - Built-in resilience
 *
 * Perfect for:
 * - Automated deployments
 * - Production monitoring
 * - Preview environments
 * - Deployment automation
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

if (!VERCEL_TOKEN) {
  logger.warn('⚠️  VERCEL_TOKEN not set. Vercel features will not work.');
}

const VERCEL_API_BASE = 'https://api.vercel.com';

// Rate limiter: Vercel has 100 req/10s on free tier = 600 req/min
const vercelRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 100, // 100ms between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 10 * 1000, // 10 seconds
  id: 'vercel',
});

export interface Deployment {
  id: string;
  url: string;
  name: string;
  state: string;
  ready: number;
  createdAt: number;
  target: string | null;
}

export interface Project {
  id: string;
  name: string;
  framework: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Internal function to make Vercel API request
 */
async function vercelRequest<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  endpoint: string,
  data?: unknown
): Promise<T> {
  if (!VERCEL_TOKEN) {
    throw new Error('Vercel token not set. Set VERCEL_TOKEN.');
  }

  const url = `${VERCEL_API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };

  logger.info({ method, endpoint }, 'Making Vercel API request');

  const response = await axios({
    method,
    url,
    headers,
    data,
  });

  logger.info({ method, endpoint, status: response.status }, 'Vercel API request successful');

  return response.data as T;
}

/**
 * Create deployment
 */
async function createDeploymentInternal(
  name: string,
  files: Array<{ file: string; data: string }>,
  options?: {
    target?: 'production' | 'preview';
    gitSource?: {
      type: 'github' | 'gitlab' | 'bitbucket';
      ref: string;
      repoId: string;
    };
    env?: Record<string, string>;
  }
): Promise<Deployment> {
  logger.info({ name, filesCount: files.length, options }, 'Creating Vercel deployment');

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

  const payload: {
    name: string;
    files: Array<{ file: string; data: string }>;
    target?: 'production' | 'preview';
    gitSource?: {
      type: 'github' | 'gitlab' | 'bitbucket';
      ref: string;
      repoId: string;
    };
    env?: Record<string, string>;
  } = {
    name,
    files,
  };

  if (options?.target) payload.target = options.target;
  if (options?.gitSource) payload.gitSource = options.gitSource;
  if (options?.env) payload.env = options.env;

  const response = await vercelRequest<{
    id: string;
    url: string;
    name: string;
    readyState: string;
    ready: number;
    createdAt: number;
    target: string | null;
  }>('POST', `/v13/deployments${teamQuery}`, payload);

  logger.info({ deploymentId: response.id, url: response.url }, 'Deployment created');

  return {
    id: response.id,
    url: response.url,
    name: response.name,
    state: response.readyState,
    ready: response.ready,
    createdAt: response.createdAt,
    target: response.target,
  };
}

const createDeploymentWithBreaker = createCircuitBreaker(createDeploymentInternal, {
  timeout: 30000, // Deployments can take longer
  name: 'vercel-create-deployment',
});

const createDeploymentRateLimited = withRateLimit(
  async (
    name: string,
    files: Array<{ file: string; data: string }>,
    options?: {
      target?: 'production' | 'preview';
      gitSource?: {
        type: 'github' | 'gitlab' | 'bitbucket';
        ref: string;
        repoId: string;
      };
      env?: Record<string, string>;
    }
  ) => createDeploymentWithBreaker.fire(name, files, options),
  vercelRateLimiter
);

export async function createDeployment(
  name: string,
  files: Array<{ file: string; data: string }>,
  options?: {
    target?: 'production' | 'preview';
    gitSource?: {
      type: 'github' | 'gitlab' | 'bitbucket';
      ref: string;
      repoId: string;
    };
    env?: Record<string, string>;
  }
): Promise<Deployment> {
  return (await createDeploymentRateLimited(name, files, options)) as Deployment;
}

/**
 * Get deployment
 */
export async function getDeployment(deploymentId: string): Promise<Deployment> {
  logger.info({ deploymentId }, 'Getting Vercel deployment');

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

  const response = await vercelRequest<{
    id: string;
    url: string;
    name: string;
    readyState: string;
    ready: number;
    createdAt: number;
    target: string | null;
  }>('GET', `/v13/deployments/${deploymentId}${teamQuery}`);

  logger.info({ deploymentId, state: response.readyState }, 'Deployment retrieved');

  return {
    id: response.id,
    url: response.url,
    name: response.name,
    state: response.readyState,
    ready: response.ready,
    createdAt: response.createdAt,
    target: response.target,
  };
}

/**
 * List deployments
 */
export async function listDeployments(options?: {
  projectId?: string;
  target?: 'production' | 'preview';
  limit?: number;
}): Promise<Deployment[]> {
  logger.info({ options }, 'Listing Vercel deployments');

  const params = new URLSearchParams();
  if (VERCEL_TEAM_ID) params.append('teamId', VERCEL_TEAM_ID);
  if (options?.projectId) params.append('projectId', options.projectId);
  if (options?.target) params.append('target', options.target);
  if (options?.limit) params.append('limit', options.limit.toString());

  const queryString = params.toString();
  const endpoint = `/v6/deployments${queryString ? `?${queryString}` : ''}`;

  const response = await vercelRequest<{
    deployments: Array<{
      uid: string;
      url: string;
      name: string;
      state: string;
      ready: number;
      createdAt: number;
      target: string | null;
    }>;
  }>('GET', endpoint);

  logger.info({ deploymentCount: response.deployments.length }, 'Deployments listed');

  return response.deployments.map((deployment) => ({
    id: deployment.uid,
    url: deployment.url,
    name: deployment.name,
    state: deployment.state,
    ready: deployment.ready,
    createdAt: deployment.createdAt,
    target: deployment.target,
  }));
}

/**
 * Delete deployment
 */
export async function deleteDeployment(deploymentId: string): Promise<{ message: string }> {
  logger.info({ deploymentId }, 'Deleting Vercel deployment');

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

  await vercelRequest('DELETE', `/v13/deployments/${deploymentId}${teamQuery}`);

  logger.info({ deploymentId }, 'Deployment deleted');

  return { message: 'Deployment deleted successfully' };
}

/**
 * Get deployment logs
 */
export async function getDeploymentLogs(
  deploymentId: string,
  options?: {
    limit?: number;
    since?: number;
  }
): Promise<Array<{
  id: string;
  message: string;
  timestamp: number;
  type: string;
}>> {
  logger.info({ deploymentId, options }, 'Getting deployment logs');

  const params = new URLSearchParams();
  if (VERCEL_TEAM_ID) params.append('teamId', VERCEL_TEAM_ID);
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.since) params.append('since', options.since.toString());

  const queryString = params.toString();
  const endpoint = `/v2/deployments/${deploymentId}/events${queryString ? `?${queryString}` : ''}`;

  const response = await vercelRequest<
    Array<{
      id: string;
      payload: {
        text: string;
        type: string;
      };
      created: number;
    }>
  >('GET', endpoint);

  logger.info({ deploymentId, logCount: response.length }, 'Deployment logs retrieved');

  return response.map((log) => ({
    id: log.id,
    message: log.payload.text,
    timestamp: log.created,
    type: log.payload.type,
  }));
}

/**
 * List projects
 */
export async function listProjects(limit: number = 20): Promise<Project[]> {
  logger.info({ limit }, 'Listing Vercel projects');

  const params = new URLSearchParams();
  if (VERCEL_TEAM_ID) params.append('teamId', VERCEL_TEAM_ID);
  params.append('limit', limit.toString());

  const queryString = params.toString();
  const endpoint = `/v9/projects${queryString ? `?${queryString}` : ''}`;

  const response = await vercelRequest<{
    projects: Array<{
      id: string;
      name: string;
      framework: string | null;
      createdAt: number;
      updatedAt: number;
    }>;
  }>('GET', endpoint);

  logger.info({ projectCount: response.projects.length }, 'Projects listed');

  return response.projects.map((project) => ({
    id: project.id,
    name: project.name,
    framework: project.framework,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
}

/**
 * Get project
 */
export async function getProject(projectId: string): Promise<Project> {
  logger.info({ projectId }, 'Getting Vercel project');

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

  const response = await vercelRequest<{
    id: string;
    name: string;
    framework: string | null;
    createdAt: number;
    updatedAt: number;
  }>('GET', `/v9/projects/${projectId}${teamQuery}`);

  logger.info({ projectId, name: response.name }, 'Project retrieved');

  return {
    id: response.id,
    name: response.name,
    framework: response.framework,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}

/**
 * Cancel deployment
 */
export async function cancelDeployment(deploymentId: string): Promise<{ message: string }> {
  logger.info({ deploymentId }, 'Canceling Vercel deployment');

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

  await vercelRequest('PATCH', `/v12/deployments/${deploymentId}/cancel${teamQuery}`);

  logger.info({ deploymentId }, 'Deployment canceled');

  return { message: 'Deployment canceled successfully' };
}

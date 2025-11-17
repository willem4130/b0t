import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * CircleCI Module
 *
 * Manage CircleCI pipelines and projects
 * - Trigger pipelines
 * - Get pipeline status
 * - List projects and pipelines
 * - Get workflow information
 * - Download artifacts
 * - Built-in resilience
 *
 * Perfect for:
 * - CI/CD automation
 * - Pipeline orchestration
 * - Build monitoring
 * - Automated deployments
 */

const CIRCLECI_TOKEN = process.env.CIRCLECI_TOKEN;

if (!CIRCLECI_TOKEN) {
  logger.warn('⚠️  CIRCLECI_TOKEN not set. CircleCI features will not work.');
}

const CIRCLECI_API_BASE = 'https://circleci.com/api/v2';

// Rate limiter: CircleCI has no strict published limits, using conservative 60 req/min
const circleciRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 1000, // 1 second between requests
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
  id: 'circleci',
});

export interface Pipeline {
  id: string;
  projectSlug: string;
  state: string;
  number: number;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  stoppedAt: string | null;
}

export interface Project {
  slug: string;
  name: string;
  organizationName: string;
}

/**
 * Internal function to make CircleCI API request
 */
async function circleciRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  data?: unknown
): Promise<T> {
  if (!CIRCLECI_TOKEN) {
    throw new Error('CircleCI token not set. Set CIRCLECI_TOKEN.');
  }

  const url = `${CIRCLECI_API_BASE}${endpoint}`;

  logger.info({ method, endpoint }, 'Making CircleCI API request');

  const response = await axios({
    method,
    url,
    headers: {
      'Circle-Token': CIRCLECI_TOKEN,
      'Content-Type': 'application/json',
    },
    data,
  });

  logger.info({ method, endpoint, status: response.status }, 'CircleCI API request successful');

  return response.data as T;
}

/**
 * Trigger pipeline
 */
async function triggerPipelineInternal(
  projectSlug: string,
  options?: {
    branch?: string;
    tag?: string;
    parameters?: Record<string, string | number | boolean>;
  }
): Promise<Pipeline> {
  logger.info({ projectSlug, options }, 'Triggering CircleCI pipeline');

  const payload: {
    branch?: string;
    tag?: string;
    parameters?: Record<string, string | number | boolean>;
  } = {};

  if (options?.branch) payload.branch = options.branch;
  if (options?.tag) payload.tag = options.tag;
  if (options?.parameters) payload.parameters = options.parameters;

  const response = await circleciRequest<{
    id: string;
    state: string;
    number: number;
    created_at: string;
  }>('POST', `/project/${projectSlug}/pipeline`, payload);

  logger.info({ pipelineId: response.id }, 'Pipeline triggered successfully');

  return {
    id: response.id,
    projectSlug,
    state: response.state,
    number: response.number,
    createdAt: response.created_at,
    updatedAt: response.created_at,
  };
}

const triggerPipelineWithBreaker = createCircuitBreaker(triggerPipelineInternal, {
  timeout: 15000,
  name: 'circleci-trigger-pipeline',
});

const triggerPipelineRateLimited = withRateLimit(
  async (
    projectSlug: string,
    options?: {
      branch?: string;
      tag?: string;
      parameters?: Record<string, string | number | boolean>;
    }
  ) => triggerPipelineWithBreaker.fire(projectSlug, options),
  circleciRateLimiter
);

export async function triggerPipeline(
  projectSlug: string,
  options?: {
    branch?: string;
    tag?: string;
    parameters?: Record<string, string | number | boolean>;
  }
): Promise<Pipeline> {
  return (await triggerPipelineRateLimited(projectSlug, options)) as Pipeline;
}

/**
 * Get pipeline
 */
export async function getPipeline(pipelineId: string): Promise<Pipeline> {
  logger.info({ pipelineId }, 'Getting CircleCI pipeline');

  const response = await circleciRequest<{
    id: string;
    project_slug: string;
    state: string;
    number: number;
    created_at: string;
    updated_at: string;
  }>('GET', `/pipeline/${pipelineId}`);

  logger.info({ pipelineId, state: response.state }, 'Pipeline retrieved');

  return {
    id: response.id,
    projectSlug: response.project_slug,
    state: response.state,
    number: response.number,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

/**
 * List project pipelines
 */
export async function listPipelines(
  projectSlug: string,
  options?: {
    branch?: string;
    pageToken?: string;
  }
): Promise<{ pipelines: Pipeline[]; nextPageToken: string | null }> {
  logger.info({ projectSlug, options }, 'Listing CircleCI pipelines');

  const params = new URLSearchParams();
  if (options?.branch) params.append('branch', options.branch);
  if (options?.pageToken) params.append('page-token', options.pageToken);

  const queryString = params.toString();
  const endpoint = `/project/${projectSlug}/pipeline${queryString ? `?${queryString}` : ''}`;

  const response = await circleciRequest<{
    items: Array<{
      id: string;
      project_slug: string;
      state: string;
      number: number;
      created_at: string;
      updated_at: string;
    }>;
    next_page_token: string | null;
  }>('GET', endpoint);

  logger.info({ pipelineCount: response.items.length }, 'Pipelines listed');

  return {
    pipelines: response.items.map((pipeline) => ({
      id: pipeline.id,
      projectSlug: pipeline.project_slug,
      state: pipeline.state,
      number: pipeline.number,
      createdAt: pipeline.created_at,
      updatedAt: pipeline.updated_at,
    })),
    nextPageToken: response.next_page_token,
  };
}

/**
 * Get pipeline workflows
 */
export async function getPipelineWorkflows(pipelineId: string): Promise<Workflow[]> {
  logger.info({ pipelineId }, 'Getting pipeline workflows');

  const response = await circleciRequest<{
    items: Array<{
      id: string;
      name: string;
      status: string;
      created_at: string;
      stopped_at: string | null;
    }>;
  }>('GET', `/pipeline/${pipelineId}/workflow`);

  logger.info({ workflowCount: response.items.length }, 'Workflows retrieved');

  return response.items.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    createdAt: workflow.created_at,
    stoppedAt: workflow.stopped_at,
  }));
}

/**
 * Get workflow details
 */
export async function getWorkflow(workflowId: string): Promise<Workflow> {
  logger.info({ workflowId }, 'Getting workflow details');

  const response = await circleciRequest<{
    id: string;
    name: string;
    status: string;
    created_at: string;
    stopped_at: string | null;
  }>('GET', `/workflow/${workflowId}`);

  logger.info({ workflowId, status: response.status }, 'Workflow details retrieved');

  return {
    id: response.id,
    name: response.name,
    status: response.status,
    createdAt: response.created_at,
    stoppedAt: response.stopped_at,
  };
}

/**
 * Cancel workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<{ message: string }> {
  logger.info({ workflowId }, 'Canceling workflow');

  const response = await circleciRequest<{ message: string }>(
    'POST',
    `/workflow/${workflowId}/cancel`
  );

  logger.info({ workflowId }, 'Workflow canceled');

  return response;
}

/**
 * Rerun workflow
 */
export async function rerunWorkflow(
  workflowId: string,
  options?: {
    fromFailed?: boolean;
    jobs?: string[];
  }
): Promise<{ workflow_id: string }> {
  logger.info({ workflowId, options }, 'Rerunning workflow');

  const payload: {
    from_failed?: boolean;
    jobs?: string[];
  } = {};

  if (options?.fromFailed !== undefined) payload.from_failed = options.fromFailed;
  if (options?.jobs) payload.jobs = options.jobs;

  const response = await circleciRequest<{ workflow_id: string }>(
    'POST',
    `/workflow/${workflowId}/rerun`,
    payload
  );

  logger.info({ newWorkflowId: response.workflow_id }, 'Workflow rerun triggered');

  return response;
}

/**
 * List workflow jobs
 */
export async function listWorkflowJobs(workflowId: string): Promise<Array<{
  id: string;
  name: string;
  status: string;
  jobNumber: number;
  startedAt: string | null;
  stoppedAt: string | null;
}>> {
  logger.info({ workflowId }, 'Listing workflow jobs');

  const response = await circleciRequest<{
    items: Array<{
      id: string;
      name: string;
      status: string;
      job_number: number;
      started_at: string | null;
      stopped_at: string | null;
    }>;
  }>('GET', `/workflow/${workflowId}/job`);

  logger.info({ jobCount: response.items.length }, 'Jobs listed');

  return response.items.map((job) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    jobNumber: job.job_number,
    startedAt: job.started_at,
    stoppedAt: job.stopped_at,
  }));
}

/**
 * Get project details (requires project slug format: vcs-slug/org-name/repo-name)
 */
export async function getProject(projectSlug: string): Promise<Project> {
  logger.info({ projectSlug }, 'Getting project details');

  // Extract organization and repo name from slug
  const slugParts = projectSlug.split('/');
  const organizationName = slugParts[1] || '';
  const repoName = slugParts[2] || '';

  const response = await circleciRequest<{
    slug: string;
    name: string;
    organization_name: string;
  }>('GET', `/project/${projectSlug}`);

  logger.info({ projectSlug }, 'Project details retrieved');

  return {
    slug: response.slug,
    name: response.name || repoName,
    organizationName: response.organization_name || organizationName,
  };
}

import { Octokit } from '@octokit/rest';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * GitHub Actions Module
 *
 * Manage GitHub Actions workflows and runs
 * - Trigger workflow runs
 * - Get workflow run status
 * - List workflows and runs
 * - Cancel workflow runs
 * - Download artifacts
 * - Built-in resilience
 *
 * Perfect for:
 * - CI/CD automation
 * - Automated testing
 * - Deployment pipelines
 * - Build monitoring
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  logger.warn('⚠️  GITHUB_TOKEN not set. GitHub Actions features will not work.');
}

const githubClient = GITHUB_TOKEN
  ? new Octokit({ auth: GITHUB_TOKEN })
  : null;

// Rate limiter: GitHub allows 5000 req/hour for authenticated users
const githubActionsRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 100, // 100ms between requests
  reservoir: 5000,
  reservoirRefreshAmount: 5000,
  reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
  id: 'github-actions',
});

export interface WorkflowRun {
  id: number;
  name: string | null | undefined;
  headBranch: string | null;
  headSha: string;
  status: string | null;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Trigger workflow run
 */
async function triggerWorkflowInternal(
  owner: string,
  repo: string,
  workflowId: string | number,
  ref: string,
  inputs?: Record<string, string>
): Promise<void> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info(
    { owner, repo, workflowId, ref },
    'Triggering GitHub Actions workflow'
  );

  await githubClient.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: workflowId,
    ref,
    inputs,
  });

  logger.info({ workflowId }, 'GitHub Actions workflow triggered');
}

const triggerWorkflowWithBreaker = createCircuitBreaker(triggerWorkflowInternal, {
  timeout: 15000,
  name: 'github-actions-trigger-workflow',
});

const triggerWorkflowRateLimited = withRateLimit(
  async (
    owner: string,
    repo: string,
    workflowId: string | number,
    ref: string,
    inputs?: Record<string, string>
  ) => triggerWorkflowWithBreaker.fire(owner, repo, workflowId, ref, inputs),
  githubActionsRateLimiter
);

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: string | number,
  ref: string,
  inputs?: Record<string, string>
): Promise<void> {
  return (await triggerWorkflowRateLimited(owner, repo, workflowId, ref, inputs)) as void;
}

/**
 * Get workflow run
 */
export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number
): Promise<WorkflowRun> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, runId }, 'Getting GitHub Actions workflow run');

  const response = await githubClient.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });

  logger.info({ runId, status: response.data.status }, 'Workflow run retrieved');

  return {
    id: response.data.id,
    name: response.data.name,
    headBranch: response.data.head_branch,
    headSha: response.data.head_sha,
    status: response.data.status,
    conclusion: response.data.conclusion,
    htmlUrl: response.data.html_url,
    createdAt: response.data.created_at,
    updatedAt: response.data.updated_at,
  };
}

/**
 * List workflow runs
 */
export async function listWorkflowRuns(
  owner: string,
  repo: string,
  workflowId?: string | number,
  options?: {
    branch?: string;
    status?: 'queued' | 'in_progress' | 'completed';
    per_page?: number;
  }
): Promise<WorkflowRun[]> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, workflowId, options }, 'Listing workflow runs');

  const params: {
    owner: string;
    repo: string;
    workflow_id?: string | number;
    branch?: string;
    status?: 'queued' | 'in_progress' | 'completed';
    per_page?: number;
  } = {
    owner,
    repo,
    branch: options?.branch,
    status: options?.status,
    per_page: options?.per_page || 30,
  };

  if (workflowId) {
    params.workflow_id = workflowId;
  }

  const response = workflowId
    ? await githubClient.actions.listWorkflowRuns(params as {
        owner: string;
        repo: string;
        workflow_id: string | number;
        branch?: string;
        status?: 'queued' | 'in_progress' | 'completed';
        per_page?: number;
      })
    : await githubClient.actions.listWorkflowRunsForRepo(params);

  logger.info({ runCount: response.data.workflow_runs.length }, 'Workflow runs listed');

  return response.data.workflow_runs.map((run) => ({
    id: run.id,
    name: run.name,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  }));
}

/**
 * List workflows
 */
export async function listWorkflows(
  owner: string,
  repo: string,
  per_page: number = 30
): Promise<Workflow[]> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo }, 'Listing GitHub Actions workflows');

  const response = await githubClient.actions.listRepoWorkflows({
    owner,
    repo,
    per_page,
  });

  logger.info({ workflowCount: response.data.workflows.length }, 'Workflows listed');

  return response.data.workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state,
    createdAt: workflow.created_at,
    updatedAt: workflow.updated_at,
  }));
}

/**
 * Cancel workflow run
 */
export async function cancelWorkflowRun(
  owner: string,
  repo: string,
  runId: number
): Promise<void> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, runId }, 'Canceling GitHub Actions workflow run');

  await githubClient.actions.cancelWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });

  logger.info({ runId }, 'Workflow run canceled');
}

/**
 * Rerun workflow
 */
export async function rerunWorkflow(
  owner: string,
  repo: string,
  runId: number
): Promise<void> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, runId }, 'Rerunning GitHub Actions workflow');

  await githubClient.actions.reRunWorkflow({
    owner,
    repo,
    run_id: runId,
  });

  logger.info({ runId }, 'Workflow rerun triggered');
}

/**
 * List workflow run artifacts
 */
export async function listWorkflowArtifacts(
  owner: string,
  repo: string,
  runId: number
): Promise<Array<{
  id: number;
  name: string;
  sizeInBytes: number;
  url: string;
  createdAt: string | null;
}>> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, runId }, 'Listing workflow run artifacts');

  const response = await githubClient.actions.listWorkflowRunArtifacts({
    owner,
    repo,
    run_id: runId,
  });

  logger.info({ artifactCount: response.data.artifacts.length }, 'Artifacts listed');

  return response.data.artifacts.map((artifact) => ({
    id: artifact.id,
    name: artifact.name,
    sizeInBytes: artifact.size_in_bytes,
    url: artifact.url,
    createdAt: artifact.created_at,
  }));
}

/**
 * Get workflow run logs URL
 */
export async function getWorkflowRunLogs(
  owner: string,
  repo: string,
  runId: number
): Promise<{ url: string }> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, runId }, 'Getting workflow run logs URL');

  const response = await githubClient.actions.downloadWorkflowRunLogs({
    owner,
    repo,
    run_id: runId,
  });

  logger.info({ runId }, 'Workflow run logs URL retrieved');

  return {
    url: response.url,
  };
}

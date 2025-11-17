import { Octokit } from '@octokit/rest';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * GitHub Module
 *
 * Manage repositories, issues, pull requests, and more
 * - Create and update issues
 * - Create pull requests
 * - List and search repos
 * - Manage releases
 * - Built-in resilience
 *
 * Perfect for:
 * - CI/CD automation
 * - Issue management
 * - Release automation
 * - Code review workflows
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  logger.warn('⚠️  GITHUB_TOKEN not set. GitHub features will not work.');
}

const githubClient = GITHUB_TOKEN
  ? new Octokit({ auth: GITHUB_TOKEN })
  : null;

// Rate limiter: GitHub allows 5000 req/hour for authenticated users
const githubRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 100, // 100ms between requests
  reservoir: 5000,
  reservoirRefreshAmount: 5000,
  reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
  id: 'github',
});

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubCreateIssueOptions {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

/**
 * Internal create issue function (unprotected)
 */
async function createIssueInternal(
  options: GitHubCreateIssueOptions
): Promise<GitHubIssue> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info(
    {
      owner: options.owner,
      repo: options.repo,
      title: options.title.substring(0, 50),
    },
    'Creating GitHub issue'
  );

  const response = await githubClient.issues.create({
    owner: options.owner,
    repo: options.repo,
    title: options.title,
    body: options.body,
    labels: options.labels,
    assignees: options.assignees,
  });

  logger.info({ issueNumber: response.data.number }, 'GitHub issue created');

  return {
    number: response.data.number,
    title: response.data.title,
    body: response.data.body || '',
    state: response.data.state,
    htmlUrl: response.data.html_url,
    createdAt: response.data.created_at,
    updatedAt: response.data.updated_at,
  };
}

/**
 * Create issue (protected)
 */
const createIssueWithBreaker = createCircuitBreaker(createIssueInternal, {
  timeout: 15000,
  name: 'github-create-issue',
});

const createIssueRateLimited = withRateLimit(
  async (options: GitHubCreateIssueOptions) =>
    createIssueWithBreaker.fire(options),
  githubRateLimiter
);

export async function createIssue(
  options: GitHubCreateIssueOptions
): Promise<GitHubIssue> {
  return (await createIssueRateLimited(options)) as unknown as GitHubIssue;
}

/**
 * Update issue
 */
export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  options: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
  }
): Promise<GitHubIssue> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, issueNumber }, 'Updating GitHub issue');

  const response = await githubClient.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    ...options,
  });

  logger.info({ issueNumber: response.data.number }, 'GitHub issue updated');

  return {
    number: response.data.number,
    title: response.data.title,
    body: response.data.body || '',
    state: response.data.state,
    htmlUrl: response.data.html_url,
    createdAt: response.data.created_at,
    updatedAt: response.data.updated_at,
  };
}

/**
 * List issues
 */
export async function listIssues(
  owner: string,
  repo: string,
  options?: {
    state?: 'open' | 'closed' | 'all';
    labels?: string;
    per_page?: number;
  }
): Promise<GitHubIssue[]> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, options }, 'Listing GitHub issues');

  const response = await githubClient.issues.listForRepo({
    owner,
    repo,
    state: options?.state || 'open',
    labels: options?.labels,
    per_page: options?.per_page || 30,
  });

  logger.info({ issueCount: response.data.length }, 'GitHub issues listed');

  return response.data.map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body || '',
    state: issue.state,
    htmlUrl: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  }));
}

/**
 * Create pull request
 */
export async function createPullRequest(
  owner: string,
  repo: string,
  options: {
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
  }
): Promise<{
  number: number;
  title: string;
  htmlUrl: string;
  state: string;
}> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, title: options.title }, 'Creating GitHub pull request');

  const response = await githubClient.pulls.create({
    owner,
    repo,
    title: options.title,
    head: options.head,
    base: options.base,
    body: options.body,
    draft: options.draft,
  });

  logger.info({ prNumber: response.data.number }, 'GitHub pull request created');

  return {
    number: response.data.number,
    title: response.data.title,
    htmlUrl: response.data.html_url,
    state: response.data.state,
  };
}

/**
 * List pull requests
 */
export async function listPullRequests(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<Array<{
  number: number;
  title: string;
  htmlUrl: string;
  state: string;
}>> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, state }, 'Listing GitHub pull requests');

  const response = await githubClient.pulls.list({
    owner,
    repo,
    state,
  });

  logger.info({ prCount: response.data.length }, 'GitHub pull requests listed');

  return response.data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    htmlUrl: pr.html_url,
    state: pr.state,
  }));
}

/**
 * Create release
 */
export async function createRelease(
  owner: string,
  repo: string,
  options: {
    tagName: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
  }
): Promise<{
  id: number;
  htmlUrl: string;
  tagName: string;
  name: string;
}> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, tagName: options.tagName }, 'Creating GitHub release');

  const response = await githubClient.repos.createRelease({
    owner,
    repo,
    tag_name: options.tagName,
    name: options.name,
    body: options.body,
    draft: options.draft,
    prerelease: options.prerelease,
  });

  logger.info({ releaseId: response.data.id }, 'GitHub release created');

  return {
    id: response.data.id,
    htmlUrl: response.data.html_url,
    tagName: response.data.tag_name,
    name: response.data.name || '',
  };
}

/**
 * Get repository
 */
export async function getRepository(
  owner: string,
  repo: string
): Promise<{
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
  forksCount: number;
}> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo }, 'Getting GitHub repository');

  const response = await githubClient.repos.get({
    owner,
    repo,
  });

  logger.info({ repoName: response.data.full_name }, 'GitHub repository retrieved');

  return {
    name: response.data.name,
    fullName: response.data.full_name,
    description: response.data.description || '',
    htmlUrl: response.data.html_url,
    stargazersCount: response.data.stargazers_count,
    forksCount: response.data.forks_count,
  };
}

/**
 * Search repositories
 */
export async function searchRepositories(
  query: string,
  sort?: 'stars' | 'forks' | 'updated',
  per_page: number = 30
): Promise<Array<{
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
}>> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ query, sort, per_page }, 'Searching GitHub repositories');

  const response = await githubClient.search.repos({
    q: query,
    sort,
    per_page,
  });

  logger.info({ resultCount: response.data.items.length }, 'GitHub search completed');

  return response.data.items.map((repo) => ({
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description || '',
    htmlUrl: repo.html_url,
    stargazersCount: repo.stargazers_count,
  }));
}

/**
 * Add comment to issue
 */
export async function addIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<{ id: number; htmlUrl: string }> {
  if (!githubClient) {
    throw new Error('GitHub client not initialized. Set GITHUB_TOKEN.');
  }

  logger.info({ owner, repo, issueNumber }, 'Adding comment to GitHub issue');

  const response = await githubClient.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });

  logger.info({ commentId: response.data.id }, 'GitHub comment added');

  return {
    id: response.data.id,
    htmlUrl: response.data.html_url,
  };
}

/**
 * Get trending repositories
 * Uses GitHub public search API to find repos created/updated recently with high stars
 * No authentication required - uses public API
 */
export async function getTrendingRepositories(options?: {
  language?: string;
  since?: 'daily' | 'weekly' | 'monthly';
  per_page?: number;
}): Promise<Array<{
  name: string;
  fullName: string;
  owner: string;
  description: string;
  htmlUrl: string;
  stargazersCount: number;
  language: string;
  forksCount: number;
  createdAt: string;
}>> {
  const since = options?.since || 'weekly';
  const per_page = Math.min(options?.per_page || 30, 100); // GitHub max is 100

  // Calculate date range based on 'since' parameter
  const dateRanges = {
    daily: 1,
    weekly: 7,
    monthly: 30,
  };

  const daysAgo = dateRanges[since];
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dateStr = date.toISOString().split('T')[0];

  // Build search query
  let query = `created:>${dateStr} stars:>10`;

  if (options?.language) {
    query += ` language:${options.language}`;
  }

  logger.info({ query, since, language: options?.language }, 'Getting trending GitHub repositories');

  // Use public GitHub API (no auth required)
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', per_page.toString());

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'b0t-workflow-automation',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    items: Array<{
      name: string;
      full_name: string;
      owner: { login: string } | null;
      description: string | null;
      html_url: string;
      stargazers_count: number;
      language: string | null;
      forks_count: number;
      created_at: string;
    }>;
  };

  logger.info({ resultCount: data.items.length }, 'Trending repositories retrieved');

  return data.items.map((repo) => ({
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login || 'Unknown',
    description: repo.description || '',
    htmlUrl: repo.html_url,
    stargazersCount: repo.stargazers_count,
    language: repo.language || 'Unknown',
    forksCount: repo.forks_count,
    createdAt: repo.created_at,
  }));
}

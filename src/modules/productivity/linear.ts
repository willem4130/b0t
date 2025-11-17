import { LinearClient } from '@linear/sdk';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Linear Module
 *
 * Project management and issue tracking with Linear
 * - Create and update issues
 * - Search and filter issues
 * - Manage projects
 * - Assign issues to team members
 * - Update issue status
 * - Add comments
 * - Built-in resilience
 *
 * Perfect for:
 * - Automated issue creation from workflows
 * - Status updates and notifications
 * - Project management automation
 * - Team collaboration
 * - Bug tracking
 */

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;

if (!LINEAR_API_KEY) {
  logger.warn('⚠️  LINEAR_API_KEY not set. Linear features will not work.');
}

const linearClient = LINEAR_API_KEY ? new LinearClient({ apiKey: LINEAR_API_KEY }) : null;

// Rate limiter: Linear allows 20 requests per second
const linearRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 50, // 50ms = 20 requests per second
  reservoir: 1200,
  reservoirRefreshAmount: 1200,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'linear',
});

export interface LinearIssue {
  id?: string;
  title: string;
  description?: string;
  teamId: string;
  assigneeId?: string;
  priority?: number; // 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
  stateId?: string;
  labelIds?: string[];
  projectId?: string;
  parentId?: string;
  estimate?: number;
  dueDate?: string;
}

export interface LinearIssueResponse {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url: string;
  state?: {
    id: string;
    name: string;
    type: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  priority?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinearSearchOptions {
  teamId?: string;
  assigneeId?: string;
  stateId?: string;
  labelId?: string;
  projectId?: string;
  priority?: number;
  limit?: number;
  includeArchived?: boolean;
}

export interface LinearProject {
  name: string;
  description?: string;
  teamId: string;
  leadId?: string;
  targetDate?: string;
  state?: 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  priority?: number;
}

export interface LinearProjectResponse {
  id: string;
  name: string;
  description?: string;
  url: string;
  state?: string;
  priority?: number;
  createdAt: Date;
}

export interface LinearComment {
  body: string;
  issueId: string;
}

/**
 * Create issue (internal)
 */
async function createIssueInternal(issue: LinearIssue): Promise<LinearIssueResponse> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info(
    {
      title: issue.title,
      teamId: issue.teamId,
      priority: issue.priority,
    },
    'Creating Linear issue'
  );

  try {
    const issuePayload = await linearClient.createIssue({
      title: issue.title,
      description: issue.description,
      teamId: issue.teamId,
      assigneeId: issue.assigneeId,
      priority: issue.priority,
      stateId: issue.stateId,
      labelIds: issue.labelIds,
      projectId: issue.projectId,
      parentId: issue.parentId,
      estimate: issue.estimate,
      dueDate: issue.dueDate,
    });

    const createdIssue = await issuePayload.issue;

    if (!createdIssue) {
      throw new Error('Failed to create issue: No issue returned');
    }

    const [state, assignee] = await Promise.all([
      createdIssue.state,
      createdIssue.assignee,
    ]);

    logger.info(
      {
        issueId: createdIssue.id,
        identifier: createdIssue.identifier,
        title: createdIssue.title,
      },
      'Linear issue created'
    );

    return {
      id: createdIssue.id,
      identifier: createdIssue.identifier,
      title: createdIssue.title,
      description: createdIssue.description || undefined,
      url: createdIssue.url,
      state: state ? { id: state.id, name: state.name, type: state.type } : undefined,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : undefined,
      priority: createdIssue.priority,
      createdAt: createdIssue.createdAt,
      updatedAt: createdIssue.updatedAt,
    };
  } catch (error) {
    logger.error({ error, title: issue.title }, 'Failed to create Linear issue');
    throw new Error(
      `Failed to create Linear issue: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const createIssueWithBreaker = createCircuitBreaker(createIssueInternal, {
  timeout: 15000,
  name: 'linear-create-issue',
});

const createIssueRateLimited = withRateLimit(
  async (issue: LinearIssue) => createIssueWithBreaker.fire(issue),
  linearRateLimiter
);

export async function createIssue(issue: LinearIssue): Promise<LinearIssueResponse> {
  return await createIssueRateLimited(issue) as unknown as LinearIssueResponse;
}

/**
 * Update issue (internal)
 */
async function updateIssueInternal(
  issueId: string,
  update: Partial<LinearIssue>
): Promise<LinearIssueResponse> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info({ issueId, updates: Object.keys(update) }, 'Updating Linear issue');

  try {
    const updatePayload: {
      title?: string;
      description?: string;
      assigneeId?: string;
      priority?: number;
      stateId?: string;
      labelIds?: string[];
      projectId?: string;
      parentId?: string;
      estimate?: number;
      dueDate?: string;
    } = {
      title: update.title,
      description: update.description,
      assigneeId: update.assigneeId,
      priority: update.priority,
      stateId: update.stateId,
      labelIds: update.labelIds,
      projectId: update.projectId,
      parentId: update.parentId,
      estimate: update.estimate,
      dueDate: update.dueDate,
    };

    const issuePayload = await linearClient.updateIssue(issueId, updatePayload);
    const updatedIssue = await issuePayload.issue;

    if (!updatedIssue) {
      throw new Error('Failed to update issue: No issue returned');
    }

    const [state, assignee] = await Promise.all([
      updatedIssue.state,
      updatedIssue.assignee,
    ]);

    logger.info({ issueId, identifier: updatedIssue.identifier }, 'Linear issue updated');

    return {
      id: updatedIssue.id,
      identifier: updatedIssue.identifier,
      title: updatedIssue.title,
      description: updatedIssue.description || undefined,
      url: updatedIssue.url,
      state: state ? { id: state.id, name: state.name, type: state.type } : undefined,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : undefined,
      priority: updatedIssue.priority,
      createdAt: updatedIssue.createdAt,
      updatedAt: updatedIssue.updatedAt,
    };
  } catch (error) {
    logger.error({ error, issueId }, 'Failed to update Linear issue');
    throw new Error(
      `Failed to update Linear issue: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const updateIssueWithBreaker = createCircuitBreaker(updateIssueInternal, {
  timeout: 15000,
  name: 'linear-update-issue',
});

const updateIssueRateLimited = withRateLimit(
  async (issueId: string, update: Partial<LinearIssue>) =>
    updateIssueWithBreaker.fire(issueId, update),
  linearRateLimiter
);

export async function updateIssue(
  issueId: string,
  update: Partial<LinearIssue>
): Promise<LinearIssueResponse> {
  return await updateIssueRateLimited(issueId, update) as unknown as LinearIssueResponse;
}

/**
 * Get issue (internal)
 */
async function getIssueInternal(issueId: string): Promise<LinearIssueResponse> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info({ issueId }, 'Getting Linear issue');

  try {
    const issue = await linearClient.issue(issueId);

    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    const [state, assignee] = await Promise.all([
      issue.state,
      issue.assignee,
    ]);

    logger.info({ issueId, identifier: issue.identifier }, 'Linear issue retrieved');

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      url: issue.url,
      state: state ? { id: state.id, name: state.name, type: state.type } : undefined,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : undefined,
      priority: issue.priority,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  } catch (error) {
    logger.error({ error, issueId }, 'Failed to get Linear issue');
    throw new Error(
      `Failed to get Linear issue: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const getIssueWithBreaker = createCircuitBreaker(getIssueInternal, {
  timeout: 15000,
  name: 'linear-get-issue',
});

const getIssueRateLimited = withRateLimit(
  async (issueId: string) => getIssueWithBreaker.fire(issueId),
  linearRateLimiter
);

export async function getIssue(issueId: string): Promise<LinearIssueResponse> {
  return await getIssueRateLimited(issueId) as unknown as LinearIssueResponse;
}

/**
 * Search issues (internal)
 */
async function searchIssuesInternal(
  options: LinearSearchOptions = {}
): Promise<LinearIssueResponse[]> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info({ options }, 'Searching Linear issues');

  try {
    const filter: Record<string, unknown> = {};

    if (options.teamId) filter.team = { id: { eq: options.teamId } };
    if (options.assigneeId) filter.assignee = { id: { eq: options.assigneeId } };
    if (options.stateId) filter.state = { id: { eq: options.stateId } };
    if (options.labelId) filter.labels = { id: { eq: options.labelId } };
    if (options.projectId) filter.project = { id: { eq: options.projectId } };
    if (options.priority !== undefined) filter.priority = { eq: options.priority };

    const issuesConnection = await linearClient.issues({
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      first: options.limit || 50,
      includeArchived: options.includeArchived || false,
    });

    const issues = issuesConnection.nodes;

    const issueResponses = await Promise.all(
      issues.map(async (issue) => {
        const [state, assignee] = await Promise.all([
          issue.state,
          issue.assignee,
        ]);

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || undefined,
          url: issue.url,
          state: state ? { id: state.id, name: state.name, type: state.type } : undefined,
          assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : undefined,
          priority: issue.priority,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        };
      })
    );

    logger.info({ count: issueResponses.length }, 'Linear issues found');

    return issueResponses;
  } catch (error) {
    logger.error({ error, options }, 'Failed to search Linear issues');
    throw new Error(
      `Failed to search Linear issues: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const searchIssuesWithBreaker = createCircuitBreaker(searchIssuesInternal, {
  timeout: 15000,
  name: 'linear-search-issues',
});

const searchIssuesRateLimited = withRateLimit(
  async (options: LinearSearchOptions) => searchIssuesWithBreaker.fire(options),
  linearRateLimiter
);

export async function searchIssues(
  options: LinearSearchOptions = {}
): Promise<LinearIssueResponse[]> {
  return await searchIssuesRateLimited(options) as unknown as LinearIssueResponse[];
}

/**
 * Add comment (internal)
 */
async function addCommentInternal(comment: LinearComment): Promise<{ id: string; body: string }> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info({ issueId: comment.issueId }, 'Adding comment to Linear issue');

  try {
    const commentPayload = await linearClient.createComment({
      issueId: comment.issueId,
      body: comment.body,
    });

    const createdComment = await commentPayload.comment;

    if (!createdComment) {
      throw new Error('Failed to create comment: No comment returned');
    }

    logger.info(
      { commentId: createdComment.id, issueId: comment.issueId },
      'Comment added to Linear issue'
    );

    return {
      id: createdComment.id,
      body: createdComment.body,
    };
  } catch (error) {
    logger.error({ error, issueId: comment.issueId }, 'Failed to add comment to Linear issue');
    throw new Error(
      `Failed to add comment: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const addCommentWithBreaker = createCircuitBreaker(addCommentInternal, {
  timeout: 15000,
  name: 'linear-add-comment',
});

const addCommentRateLimited = withRateLimit(
  async (comment: LinearComment) => addCommentWithBreaker.fire(comment),
  linearRateLimiter
);

export async function addComment(comment: LinearComment): Promise<{ id: string; body: string }> {
  return await addCommentRateLimited(comment) as unknown as { id: string; body: string };
}

/**
 * Update issue status (internal)
 */
async function updateIssueStatusInternal(
  issueId: string,
  stateId: string
): Promise<LinearIssueResponse> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info({ issueId, stateId }, 'Updating Linear issue status');

  try {
    const issuePayload = await linearClient.updateIssue(issueId, { stateId });
    const updatedIssue = await issuePayload.issue;

    if (!updatedIssue) {
      throw new Error('Failed to update issue status: No issue returned');
    }

    const [state, assignee] = await Promise.all([
      updatedIssue.state,
      updatedIssue.assignee,
    ]);

    logger.info(
      { issueId, identifier: updatedIssue.identifier, newState: state?.name },
      'Linear issue status updated'
    );

    return {
      id: updatedIssue.id,
      identifier: updatedIssue.identifier,
      title: updatedIssue.title,
      description: updatedIssue.description || undefined,
      url: updatedIssue.url,
      state: state ? { id: state.id, name: state.name, type: state.type } : undefined,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : undefined,
      priority: updatedIssue.priority,
      createdAt: updatedIssue.createdAt,
      updatedAt: updatedIssue.updatedAt,
    };
  } catch (error) {
    logger.error({ error, issueId, stateId }, 'Failed to update Linear issue status');
    throw new Error(
      `Failed to update issue status: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const updateIssueStatusWithBreaker = createCircuitBreaker(updateIssueStatusInternal, {
  timeout: 15000,
  name: 'linear-update-status',
});

const updateIssueStatusRateLimited = withRateLimit(
  async (issueId: string, stateId: string) => updateIssueStatusWithBreaker.fire(issueId, stateId),
  linearRateLimiter
);

export async function updateIssueStatus(
  issueId: string,
  stateId: string
): Promise<LinearIssueResponse> {
  return await updateIssueStatusRateLimited(issueId, stateId) as unknown as LinearIssueResponse;
}

/**
 * Assign issue (internal)
 */
async function assignIssueInternal(
  issueId: string,
  assigneeId: string
): Promise<LinearIssueResponse> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info({ issueId, assigneeId }, 'Assigning Linear issue');

  try {
    const issuePayload = await linearClient.updateIssue(issueId, { assigneeId });
    const updatedIssue = await issuePayload.issue;

    if (!updatedIssue) {
      throw new Error('Failed to assign issue: No issue returned');
    }

    const [state, assignee] = await Promise.all([
      updatedIssue.state,
      updatedIssue.assignee,
    ]);

    logger.info(
      { issueId, identifier: updatedIssue.identifier, assigneeName: assignee?.name },
      'Linear issue assigned'
    );

    return {
      id: updatedIssue.id,
      identifier: updatedIssue.identifier,
      title: updatedIssue.title,
      description: updatedIssue.description || undefined,
      url: updatedIssue.url,
      state: state ? { id: state.id, name: state.name, type: state.type } : undefined,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : undefined,
      priority: updatedIssue.priority,
      createdAt: updatedIssue.createdAt,
      updatedAt: updatedIssue.updatedAt,
    };
  } catch (error) {
    logger.error({ error, issueId, assigneeId }, 'Failed to assign Linear issue');
    throw new Error(
      `Failed to assign issue: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const assignIssueWithBreaker = createCircuitBreaker(assignIssueInternal, {
  timeout: 15000,
  name: 'linear-assign-issue',
});

const assignIssueRateLimited = withRateLimit(
  async (issueId: string, assigneeId: string) =>
    assignIssueWithBreaker.fire(issueId, assigneeId),
  linearRateLimiter
);

export async function assignIssue(
  issueId: string,
  assigneeId: string
): Promise<LinearIssueResponse> {
  return await assignIssueRateLimited(issueId, assigneeId) as unknown as LinearIssueResponse;
}

/**
 * Create project (internal)
 */
async function createProjectInternal(project: LinearProject): Promise<LinearProjectResponse> {
  if (!linearClient) {
    throw new Error('Linear client not initialized. Set LINEAR_API_KEY.');
  }

  logger.info(
    {
      name: project.name,
      teamId: project.teamId,
    },
    'Creating Linear project'
  );

  try {
    const projectPayload = await linearClient.createProject({
      name: project.name,
      description: project.description,
      teamIds: [project.teamId],
      leadId: project.leadId,
      targetDate: project.targetDate,
      priority: project.priority,
    });

    const createdProject = await projectPayload.project;

    if (!createdProject) {
      throw new Error('Failed to create project: No project returned');
    }

    logger.info(
      {
        projectId: createdProject.id,
        name: createdProject.name,
      },
      'Linear project created'
    );

    return {
      id: createdProject.id,
      name: createdProject.name,
      description: createdProject.description || undefined,
      url: createdProject.url,
      state: createdProject.state,
      priority: createdProject.priority,
      createdAt: createdProject.createdAt,
    };
  } catch (error) {
    logger.error({ error, name: project.name }, 'Failed to create Linear project');
    throw new Error(
      `Failed to create Linear project: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const createProjectWithBreaker = createCircuitBreaker(createProjectInternal, {
  timeout: 15000,
  name: 'linear-create-project',
});

const createProjectRateLimited = withRateLimit(
  async (project: LinearProject) => createProjectWithBreaker.fire(project),
  linearRateLimiter
);

export async function createProject(project: LinearProject): Promise<LinearProjectResponse> {
  return await createProjectRateLimited(project) as unknown as LinearProjectResponse;
}

import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Human Approval Module
 *
 * Enable workflows to pause and wait for human approval:
 * - Request approval from users
 * - Check approval status
 * - Approve/reject workflows via webhook or API
 * - Timeout handling for pending approvals
 * - Multi-step approval chains
 * - Conditional approval routing
 *
 * Perfect for:
 * - Content moderation workflows
 * - Financial transaction approvals
 * - Deployment gates
 * - Compliance and audit trails
 */

// Rate limiter for approval operations
const approvalRateLimiter = createRateLimiter({
  maxConcurrent: 20,
  minTime: 100,
  id: 'approval-operations',
});

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  workflowRunId: string;
  title: string;
  description: string;
  data?: Record<string, unknown>;
  requester: string;
  approvers: string[];
  approvalType: 'any' | 'all' | 'majority';
  expiresAt?: Date;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  approvals: ApprovalResponse[];
  metadata?: Record<string, unknown>;
}

export interface ApprovalResponse {
  id: string;
  requestId: string;
  approver: string;
  decision: 'approve' | 'reject';
  comment?: string;
  timestamp: Date;
}

export interface CreateApprovalOptions {
  workflowId: string;
  workflowRunId: string;
  title: string;
  description: string;
  data?: Record<string, unknown>;
  requester: string;
  approvers: string[];
  approvalType?: 'any' | 'all' | 'majority';
  expiresInMinutes?: number;
  metadata?: Record<string, unknown>;
}

// In-memory storage for approval requests (replace with DB in production)
const approvalStore = new Map<string, ApprovalRequest>();

/**
 * Internal function to create approval request
 */
async function createApprovalRequestInternal(
  options: CreateApprovalOptions
): Promise<ApprovalRequest> {
  logger.info({ workflowId: options.workflowId, approvers: options.approvers }, 'Creating approval request');

  const id = uuidv4();
  const createdAt = new Date();
  const expiresAt = options.expiresInMinutes
    ? new Date(createdAt.getTime() + options.expiresInMinutes * 60 * 1000)
    : undefined;

  const request: ApprovalRequest = {
    id,
    workflowId: options.workflowId,
    workflowRunId: options.workflowRunId,
    title: options.title,
    description: options.description,
    data: options.data,
    requester: options.requester,
    approvers: options.approvers,
    approvalType: options.approvalType || 'any',
    expiresAt,
    createdAt,
    status: 'pending',
    approvals: [],
    metadata: options.metadata,
  };

  approvalStore.set(id, request);

  logger.info({ requestId: id, expiresAt }, 'Approval request created');

  return request;
}

const createApprovalRequestWithBreaker = createCircuitBreaker(createApprovalRequestInternal, {
  timeout: 5000,
  name: 'create-approval',
});

const createApprovalRequestRateLimited = withRateLimit(
  async (options: CreateApprovalOptions) => createApprovalRequestWithBreaker.fire(options),
  approvalRateLimiter
);

/**
 * Create an approval request
 */
export async function createApprovalRequest(
  options: CreateApprovalOptions
): Promise<ApprovalRequest> {
  return await createApprovalRequestRateLimited(options);
}

/**
 * Get approval request by ID
 */
export async function getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
  logger.info({ requestId }, 'Fetching approval request');

  const request = approvalStore.get(requestId);

  if (!request) {
    logger.warn({ requestId }, 'Approval request not found');
    return null;
  }

  // Check if expired
  if (request.status === 'pending' && request.expiresAt && new Date() > request.expiresAt) {
    request.status = 'expired';
    approvalStore.set(requestId, request);

    logger.info({ requestId }, 'Approval request expired');
  }

  return request;
}

/**
 * Submit approval or rejection
 */
export async function submitApproval(
  requestId: string,
  approver: string,
  decision: 'approve' | 'reject',
  comment?: string
): Promise<ApprovalRequest> {
  logger.info({ requestId, approver, decision }, 'Submitting approval decision');

  const request = await getApprovalRequest(requestId);

  if (!request) {
    throw new Error(`Approval request ${requestId} not found`);
  }

  if (request.status !== 'pending') {
    throw new Error(`Approval request ${requestId} is not pending (status: ${request.status})`);
  }

  if (!request.approvers.includes(approver)) {
    throw new Error(`User ${approver} is not an authorized approver for this request`);
  }

  // Check if approver already responded
  if (request.approvals.some(a => a.approver === approver)) {
    throw new Error(`User ${approver} has already submitted a decision`);
  }

  // Add approval response
  const response: ApprovalResponse = {
    id: uuidv4(),
    requestId,
    approver,
    decision,
    comment,
    timestamp: new Date(),
  };

  request.approvals.push(response);

  // Determine if request is complete
  const approved = request.approvals.filter(a => a.decision === 'approve').length;
  const rejected = request.approvals.filter(a => a.decision === 'reject').length;
  const totalApprovers = request.approvers.length;

  if (request.approvalType === 'any') {
    if (approved > 0) {
      request.status = 'approved';
    } else if (rejected === totalApprovers) {
      request.status = 'rejected';
    }
  } else if (request.approvalType === 'all') {
    if (rejected > 0) {
      request.status = 'rejected';
    } else if (approved === totalApprovers) {
      request.status = 'approved';
    }
  } else if (request.approvalType === 'majority') {
    const majority = Math.ceil(totalApprovers / 2);
    if (approved >= majority) {
      request.status = 'approved';
    } else if (rejected >= majority) {
      request.status = 'rejected';
    }
  }

  approvalStore.set(requestId, request);

  logger.info({ requestId, status: request.status, approved, rejected }, 'Approval decision submitted');

  return request;
}

/**
 * Wait for approval decision with polling
 */
export async function waitForApproval(
  requestId: string,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<ApprovalRequest> {
  const pollInterval = options.pollIntervalMs || 5000;
  const timeout = options.timeoutMs || 3600000; // 1 hour default

  logger.info({ requestId, pollInterval, timeout }, 'Waiting for approval decision');

  const startTime = Date.now();

  while (true) {
    const request = await getApprovalRequest(requestId);

    if (!request) {
      throw new Error(`Approval request ${requestId} not found`);
    }

    if (request.status === 'approved' || request.status === 'rejected') {
      logger.info({ requestId, status: request.status }, 'Approval decision received');
      return request;
    }

    if (request.status === 'expired') {
      throw new Error(`Approval request ${requestId} expired`);
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for approval ${requestId}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

/**
 * Cancel a pending approval request
 */
export async function cancelApproval(requestId: string, reason?: string): Promise<ApprovalRequest> {
  logger.info({ requestId, reason }, 'Cancelling approval request');

  const request = await getApprovalRequest(requestId);

  if (!request) {
    throw new Error(`Approval request ${requestId} not found`);
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot cancel approval request ${requestId} with status ${request.status}`);
  }

  request.status = 'rejected';
  if (reason && request.metadata) {
    request.metadata.cancellationReason = reason;
  }

  approvalStore.set(requestId, request);

  logger.info({ requestId }, 'Approval request cancelled');

  return request;
}

/**
 * List approval requests with filters
 */
export async function listApprovalRequests(filters: {
  workflowId?: string;
  status?: ApprovalRequest['status'];
  approver?: string;
  requester?: string;
  limit?: number;
}): Promise<ApprovalRequest[]> {
  logger.info({ filters }, 'Listing approval requests');

  let requests = Array.from(approvalStore.values());

  if (filters.workflowId) {
    requests = requests.filter(r => r.workflowId === filters.workflowId);
  }

  if (filters.status) {
    requests = requests.filter(r => r.status === filters.status);
  }

  if (filters.approver) {
    requests = requests.filter(r => r.approvers.includes(filters.approver!));
  }

  if (filters.requester) {
    requests = requests.filter(r => r.requester === filters.requester);
  }

  // Sort by created date (newest first)
  requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (filters.limit) {
    requests = requests.slice(0, filters.limit);
  }

  logger.info({ count: requests.length }, 'Approval requests listed');

  return requests;
}

/**
 * Get approval statistics
 */
export async function getApprovalStats(workflowId?: string): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  averageResponseTimeMs: number;
}> {
  logger.info({ workflowId }, 'Fetching approval statistics');

  let requests = Array.from(approvalStore.values());

  if (workflowId) {
    requests = requests.filter(r => r.workflowId === workflowId);
  }

  const pending = requests.filter(r => r.status === 'pending').length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const rejected = requests.filter(r => r.status === 'rejected').length;
  const expired = requests.filter(r => r.status === 'expired').length;

  // Calculate average response time for completed requests
  const completedRequests = requests.filter(r => r.status === 'approved' || r.status === 'rejected');
  const responseTimes = completedRequests.map(r => {
    const firstResponse = r.approvals[0];
    if (!firstResponse) return 0;
    return firstResponse.timestamp.getTime() - r.createdAt.getTime();
  });

  const averageResponseTimeMs = responseTimes.length > 0
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
    : 0;

  return {
    total: requests.length,
    pending,
    approved,
    rejected,
    expired,
    averageResponseTimeMs,
  };
}

/**
 * Generate approval webhook URL
 */
export function generateApprovalWebhookUrl(
  requestId: string,
  approver: string,
  decision: 'approve' | 'reject',
  baseUrl: string
): string {
  const url = new URL(`${baseUrl}/api/workflows/approve`);
  url.searchParams.append('requestId', requestId);
  url.searchParams.append('approver', approver);
  url.searchParams.append('decision', decision);

  return url.toString();
}

/**
 * Cleanup expired approval requests
 */
export async function cleanupExpiredApprovals(): Promise<number> {
  logger.info('Cleaning up expired approval requests');

  const now = new Date();
  let cleanedCount = 0;

  for (const [id, request] of approvalStore.entries()) {
    if (request.status === 'pending' && request.expiresAt && now > request.expiresAt) {
      request.status = 'expired';
      approvalStore.set(id, request);
      cleanedCount++;
    }
  }

  logger.info({ cleanedCount }, 'Expired approvals cleaned up');

  return cleanedCount;
}

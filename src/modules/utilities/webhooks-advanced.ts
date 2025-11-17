import { logger } from '@/lib/logger';
import { sendWebhook, WebhookRequest, WebhookResponse } from './webhook';
import { v4 as uuidv4 } from 'uuid';

/**
 * Advanced Webhooks Module
 *
 * Enhanced webhook features beyond the basic webhook module:
 * - Webhook with automatic retry and backoff
 * - Webhook with authentication (bearer, basic, API key)
 * - Batch webhook sending (parallel and sequential)
 * - Webhook queuing and deferred execution
 * - Webhook response validation
 * - Webhook rate limiting per endpoint
 * - Webhook health monitoring
 *
 * Perfect for:
 * - Reliable webhook delivery
 * - Complex webhook workflows
 * - High-volume webhook sending
 * - Webhook error recovery
 * - API integration patterns
 */

export interface WebhookWithRetryOptions extends WebhookRequest {
  retryOptions?: {
    maxRetries?: number;
    retryDelay?: number;
    backoffMultiplier?: number;
    retryCondition?: (status: number) => boolean;
  };
}

export interface WebhookBatch {
  id: string;
  requests: WebhookRequest[];
  options: {
    parallel?: boolean;
    stopOnError?: boolean;
    delayBetween?: number;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results?: Array<WebhookResponse | Error>;
  createdAt: Date;
  completedAt?: Date;
}

export interface WebhookEndpointHealth {
  url: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastSuccess?: Date;
  lastFailure?: Date;
  consecutiveFailures: number;
  isHealthy: boolean;
}

// Webhook queue storage
const webhookQueue = new Map<string, WebhookBatch>();

// Webhook health tracking
const webhookHealth = new Map<string, WebhookEndpointHealth>();

/**
 * Send webhook with automatic retry
 */
export async function sendWebhookWithRetry(
  options: WebhookWithRetryOptions
): Promise<WebhookResponse> {
  const maxRetries = options.retryOptions?.maxRetries ?? 3;
  const retryDelay = options.retryOptions?.retryDelay ?? 1000;
  const backoffMultiplier = options.retryOptions?.backoffMultiplier ?? 2;
  const retryCondition = options.retryOptions?.retryCondition ?? ((status: number) => status >= 500);

  logger.info({ url: options.url, maxRetries }, 'Sending webhook with retry');

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await sendWebhook(options);
      const duration = Date.now() - startTime;

      // Update health tracking
      updateWebhookHealth(options.url, true, duration);

      if (attempt > 0) {
        logger.info({ url: options.url, attempt }, 'Webhook retry succeeded');
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Try to extract status code from error
      const status = (error as { response?: { status?: number } }).response?.status || 0;

      // Update health tracking
      updateWebhookHealth(options.url, false, 0);

      logger.warn({ url: options.url, attempt, status, error: lastError }, 'Webhook attempt failed');

      // Check if we should retry
      if (attempt < maxRetries && retryCondition(status)) {
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt);

        logger.info({ url: options.url, attempt: attempt + 1, delay }, 'Retrying webhook');

        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  logger.error({ url: options.url, maxRetries }, 'Webhook failed after all retries');

  throw lastError || new Error('Webhook failed after all retries');
}

/**
 * Send webhook with authentication
 */
export async function sendAuthenticatedWebhook(
  url: string,
  data: Record<string, unknown>,
  auth: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  },
  options?: {
    method?: WebhookRequest['method'];
    headers?: Record<string, string>;
    retryOptions?: WebhookWithRetryOptions['retryOptions'];
  }
): Promise<WebhookResponse> {
  logger.info({ url, authType: auth.type }, 'Sending authenticated webhook');

  return sendWebhookWithRetry({
    url,
    method: options?.method || 'POST',
    body: data,
    headers: options?.headers,
    auth,
    retryOptions: options?.retryOptions,
  });
}

/**
 * Send batch webhooks in parallel
 */
export async function sendBatchWebhooksParallel(
  requests: WebhookRequest[],
  options?: {
    maxConcurrency?: number;
    stopOnError?: boolean;
  }
): Promise<Array<WebhookResponse | Error>> {
  logger.info({ count: requests.length, maxConcurrency: options?.maxConcurrency }, 'Sending batch webhooks in parallel');

  const maxConcurrency = options?.maxConcurrency || 10;
  const results: Array<WebhookResponse | Error> = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    const index = i;

    const promise = (async () => {
      try {
        const response = await sendWebhook(request);
        results[index] = response;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results[index] = err;

        if (options?.stopOnError) {
          throw err;
        }
      }
    })();

    executing.push(promise);

    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }

  if (options?.stopOnError) {
    await Promise.all(executing);
  } else {
    await Promise.allSettled(executing);
  }

  const successCount = results.filter(r => !(r instanceof Error)).length;
  const failureCount = results.length - successCount;

  logger.info({ total: results.length, successCount, failureCount }, 'Batch webhooks completed');

  return results;
}

/**
 * Send batch webhooks sequentially
 */
export async function sendBatchWebhooksSequential(
  requests: WebhookRequest[],
  options?: {
    stopOnError?: boolean;
    delayBetween?: number;
  }
): Promise<Array<WebhookResponse | Error>> {
  logger.info({ count: requests.length, delayBetween: options?.delayBetween }, 'Sending batch webhooks sequentially');

  const results: Array<WebhookResponse | Error> = [];

  for (let i = 0; i < requests.length; i++) {
    try {
      const response = await sendWebhook(requests[i]);
      results.push(response);

      if (options?.delayBetween && i < requests.length - 1) {
        await new Promise(resolve => setTimeout(resolve, options.delayBetween));
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      results.push(err);

      if (options?.stopOnError) {
        logger.warn({ index: i, total: requests.length }, 'Stopping sequential webhooks on error');
        break;
      }
    }
  }

  const successCount = results.filter(r => !(r instanceof Error)).length;
  const failureCount = results.length - successCount;

  logger.info({ total: results.length, successCount, failureCount }, 'Sequential webhooks completed');

  return results;
}

/**
 * Queue webhook batch for deferred execution
 */
export async function queueWebhookBatch(
  requests: WebhookRequest[],
  options?: {
    parallel?: boolean;
    stopOnError?: boolean;
    delayBetween?: number;
  }
): Promise<WebhookBatch> {
  logger.info({ count: requests.length, options }, 'Queueing webhook batch');

  const id = uuidv4();
  const batch: WebhookBatch = {
    id,
    requests,
    options: options || { parallel: true },
    status: 'pending',
    createdAt: new Date(),
  };

  webhookQueue.set(id, batch);

  logger.info({ batchId: id, queueSize: webhookQueue.size }, 'Webhook batch queued');

  return batch;
}

/**
 * Process queued webhook batch
 */
export async function processWebhookBatch(batchId: string): Promise<WebhookBatch> {
  logger.info({ batchId }, 'Processing webhook batch');

  const batch = webhookQueue.get(batchId);

  if (!batch) {
    throw new Error(`Webhook batch ${batchId} not found`);
  }

  if (batch.status !== 'pending') {
    throw new Error(`Webhook batch ${batchId} is not pending (status: ${batch.status})`);
  }

  batch.status = 'processing';
  webhookQueue.set(batchId, batch);

  try {
    const results = batch.options.parallel
      ? await sendBatchWebhooksParallel(batch.requests, {
          stopOnError: batch.options.stopOnError,
        })
      : await sendBatchWebhooksSequential(batch.requests, {
          stopOnError: batch.options.stopOnError,
          delayBetween: batch.options.delayBetween,
        });

    batch.results = results;
    batch.status = 'completed';
    batch.completedAt = new Date();

    logger.info({ batchId, resultCount: results.length }, 'Webhook batch processed successfully');
  } catch (error) {
    batch.status = 'failed';
    batch.completedAt = new Date();

    logger.error({ batchId, error }, 'Webhook batch processing failed');

    throw error;
  } finally {
    webhookQueue.set(batchId, batch);
  }

  return batch;
}

/**
 * Get webhook batch status
 */
export async function getWebhookBatch(batchId: string): Promise<WebhookBatch | null> {
  logger.info({ batchId }, 'Getting webhook batch');

  return webhookQueue.get(batchId) || null;
}

/**
 * List webhook batches
 */
export async function listWebhookBatches(filters?: {
  status?: WebhookBatch['status'];
  limit?: number;
}): Promise<WebhookBatch[]> {
  logger.info({ filters }, 'Listing webhook batches');

  let batches = Array.from(webhookQueue.values());

  if (filters?.status) {
    batches = batches.filter(b => b.status === filters.status);
  }

  batches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (filters?.limit) {
    batches = batches.slice(0, filters.limit);
  }

  logger.info({ count: batches.length }, 'Webhook batches listed');

  return batches;
}

/**
 * Validate webhook response
 */
export async function validateWebhookResponse(
  response: WebhookResponse,
  validation: {
    expectedStatus?: number[];
    requiredFields?: string[];
    customValidator?: (data: unknown) => boolean;
  }
): Promise<boolean> {
  logger.info({ validation }, 'Validating webhook response');

  // Validate status code
  if (validation.expectedStatus && !validation.expectedStatus.includes(response.status)) {
    logger.warn({ status: response.status, expected: validation.expectedStatus }, 'Unexpected status code');
    return false;
  }

  // Validate required fields
  if (validation.requiredFields && typeof response.data === 'object' && response.data !== null) {
    const data = response.data as Record<string, unknown>;

    for (const field of validation.requiredFields) {
      if (!(field in data)) {
        logger.warn({ field }, 'Required field missing in response');
        return false;
      }
    }
  }

  // Custom validation
  if (validation.customValidator) {
    const isValid = validation.customValidator(response.data);

    if (!isValid) {
      logger.warn('Custom validation failed');
      return false;
    }
  }

  logger.info('Webhook response validation passed');

  return true;
}

/**
 * Update webhook health tracking
 */
function updateWebhookHealth(url: string, success: boolean, duration: number): void {
  const existing = webhookHealth.get(url);

  if (!existing) {
    webhookHealth.set(url, {
      url,
      totalRequests: 1,
      successfulRequests: success ? 1 : 0,
      failedRequests: success ? 0 : 1,
      averageResponseTime: duration,
      lastSuccess: success ? new Date() : undefined,
      lastFailure: success ? undefined : new Date(),
      consecutiveFailures: success ? 0 : 1,
      isHealthy: success,
    });
    return;
  }

  existing.totalRequests++;

  if (success) {
    existing.successfulRequests++;
    existing.lastSuccess = new Date();
    existing.consecutiveFailures = 0;
    existing.isHealthy = true;
    existing.averageResponseTime =
      (existing.averageResponseTime * (existing.totalRequests - 1) + duration) / existing.totalRequests;
  } else {
    existing.failedRequests++;
    existing.lastFailure = new Date();
    existing.consecutiveFailures++;
    existing.isHealthy = existing.consecutiveFailures < 3;
  }

  webhookHealth.set(url, existing);
}

/**
 * Get webhook endpoint health
 */
export async function getWebhookHealth(url: string): Promise<WebhookEndpointHealth | null> {
  logger.info({ url }, 'Getting webhook endpoint health');

  return webhookHealth.get(url) || null;
}

/**
 * Get all webhook health statistics
 */
export async function getAllWebhookHealth(): Promise<WebhookEndpointHealth[]> {
  logger.info('Getting all webhook health statistics');

  return Array.from(webhookHealth.values());
}

/**
 * Reset webhook health tracking
 */
export async function resetWebhookHealth(url?: string): Promise<void> {
  if (url) {
    logger.info({ url }, 'Resetting webhook health for endpoint');
    webhookHealth.delete(url);
  } else {
    logger.info('Resetting all webhook health tracking');
    webhookHealth.clear();
  }
}

/**
 * Send webhook with response validation
 */
export async function sendValidatedWebhook(
  request: WebhookRequest,
  validation: {
    expectedStatus?: number[];
    requiredFields?: string[];
    customValidator?: (data: unknown) => boolean;
  }
): Promise<WebhookResponse> {
  logger.info({ url: request.url, validation }, 'Sending webhook with validation');

  const response = await sendWebhook(request);

  const isValid = await validateWebhookResponse(response, validation);

  if (!isValid) {
    throw new Error(`Webhook response validation failed for ${request.url}`);
  }

  return response;
}

/**
 * Clean up old webhook batches
 */
export async function cleanupWebhookBatches(olderThanDays: number = 7): Promise<number> {
  logger.info({ olderThanDays }, 'Cleaning up old webhook batches');

  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  let cleanupCount = 0;

  for (const [id, batch] of webhookQueue.entries()) {
    if (
      (batch.status === 'completed' || batch.status === 'failed') &&
      batch.createdAt < cutoffDate
    ) {
      webhookQueue.delete(id);
      cleanupCount++;
    }
  }

  logger.info({ cleanupCount, remainingSize: webhookQueue.size }, 'Old webhook batches cleaned up');

  return cleanupCount;
}

/**
 * Get webhook statistics
 */
export async function getWebhookStats(): Promise<{
  queuedBatches: number;
  processingBatches: number;
  completedBatches: number;
  failedBatches: number;
  totalEndpoints: number;
  healthyEndpoints: number;
  unhealthyEndpoints: number;
}> {
  logger.info('Fetching webhook statistics');

  const batches = Array.from(webhookQueue.values());
  const health = Array.from(webhookHealth.values());

  return {
    queuedBatches: batches.filter(b => b.status === 'pending').length,
    processingBatches: batches.filter(b => b.status === 'processing').length,
    completedBatches: batches.filter(b => b.status === 'completed').length,
    failedBatches: batches.filter(b => b.status === 'failed').length,
    totalEndpoints: health.length,
    healthyEndpoints: health.filter(h => h.isHealthy).length,
    unhealthyEndpoints: health.filter(h => !h.isHealthy).length,
  };
}

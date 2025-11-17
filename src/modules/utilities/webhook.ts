import { httpRequest } from './http';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

/**
 * Webhook Module
 *
 * Send and receive webhooks with security features
 * - Send HTTP requests (GET, POST, PUT, PATCH, DELETE)
 * - HMAC signature generation/verification
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Custom headers and authentication
 *
 * Perfect for:
 * - Workflow triggers
 * - Event notifications
 * - API integrations
 * - Real-time data sync
 */

export interface WebhookRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  queryParams?: Record<string, string | number | boolean>;
  timeout?: number;
  auth?: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
}

export interface WebhookResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  timing: {
    start: number;
    end: number;
    duration: number;
  };
}

export interface WebhookSignatureOptions {
  secret: string;
  algorithm?: 'sha256' | 'sha1' | 'md5';
  encoding?: 'hex' | 'base64';
}

/**
 * Send webhook request
 */
export async function sendWebhook(request: WebhookRequest): Promise<WebhookResponse> {
  logger.info({ url: request.url, method: request.method }, 'Sending webhook');

  const startTime = Date.now();

  try {
    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...request.headers,
    };

    // Add authentication
    if (request.auth) {
      if (request.auth.type === 'bearer' && request.auth.token) {
        headers['Authorization'] = `Bearer ${request.auth.token}`;
      } else if (request.auth.type === 'basic' && request.auth.username && request.auth.password) {
        const credentials = Buffer.from(
          `${request.auth.username}:${request.auth.password}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      } else if (request.auth.type === 'api-key' && request.auth.apiKey) {
        const headerName = request.auth.apiKeyHeader || 'X-API-Key';
        headers[headerName] = request.auth.apiKey;
      }
    }

    // Build URL with query params
    let url = request.url;
    if (request.queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(request.queryParams)) {
        params.append(key, String(value));
      }
      url = `${url}?${params.toString()}`;
    }

    // Send request
    const response = await httpRequest({
      url,
      method: request.method || 'POST',
      headers,
      data: request.body,
      timeout: request.timeout,
    });

    const endTime = Date.now();

    const webhookResponse: WebhookResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      data: response.data,
      timing: {
        start: startTime,
        end: endTime,
        duration: endTime - startTime,
      },
    };

    logger.info(
      {
        url: request.url,
        status: response.status,
        duration: webhookResponse.timing.duration,
      },
      'Webhook sent successfully'
    );

    return webhookResponse;
  } catch (error) {
    const endTime = Date.now();

    logger.error(
      {
        error,
        url: request.url,
        duration: endTime - startTime,
      },
      'Failed to send webhook'
    );

    throw new Error(
      `Failed to send webhook: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Send webhook with retries
 */
export async function sendWebhookWithRetry(
  request: WebhookRequest,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<WebhookResponse> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelay = options.retryDelay ?? 1000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;

  logger.info({ url: request.url, maxRetries }, 'Sending webhook with retry');

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await sendWebhook(request);

      if (attempt > 0) {
        logger.info({ url: request.url, attempt }, 'Webhook succeeded after retry');
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt);

        logger.warn(
          {
            url: request.url,
            attempt: attempt + 1,
            maxRetries,
            delay,
          },
          'Webhook failed, retrying'
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error({ url: request.url, maxRetries }, 'Webhook failed after all retries');

  throw lastError || new Error('Webhook failed after all retries');
}

/**
 * Generate HMAC signature for webhook payload
 */
export function generateSignature(
  payload: string | Record<string, unknown>,
  options: WebhookSignatureOptions
): string {
  logger.info({ algorithm: options.algorithm }, 'Generating webhook signature');

  try {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const hmac = crypto.createHmac(options.algorithm || 'sha256', options.secret);
    hmac.update(data);

    const signature = hmac.digest(options.encoding || 'hex');

    logger.info({ signatureLength: signature.length }, 'Signature generated');

    return signature;
  } catch (error) {
    logger.error({ error }, 'Failed to generate signature');
    throw new Error(
      `Failed to generate signature: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verify HMAC signature for webhook payload
 */
export function verifySignature(
  payload: string | Record<string, unknown>,
  signature: string,
  options: WebhookSignatureOptions
): boolean {
  logger.info('Verifying webhook signature');

  try {
    const expectedSignature = generateSignature(payload, options);

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    logger.info({ isValid }, 'Signature verification completed');

    return isValid;
  } catch (error) {
    logger.error({ error }, 'Failed to verify signature');
    return false;
  }
}

/**
 * Send JSON webhook
 */
export async function sendJsonWebhook(
  url: string,
  data: Record<string, unknown>,
  options: {
    headers?: Record<string, string>;
    auth?: WebhookRequest['auth'];
  } = {}
): Promise<WebhookResponse> {
  return sendWebhook({
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: data,
    auth: options.auth,
  });
}

/**
 * Send form data webhook
 */
export async function sendFormWebhook(
  url: string,
  data: Record<string, string | number | boolean>,
  options: {
    headers?: Record<string, string>;
    auth?: WebhookRequest['auth'];
  } = {}
): Promise<WebhookResponse> {
  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, String(value));
  }

  return sendWebhook({
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...options.headers,
    },
    body: formData.toString(),
    auth: options.auth,
  });
}

/**
 * Send signed webhook with HMAC
 */
export async function sendSignedWebhook(
  url: string,
  data: Record<string, unknown>,
  signatureOptions: WebhookSignatureOptions,
  options: {
    headers?: Record<string, string>;
    signatureHeader?: string;
    auth?: WebhookRequest['auth'];
  } = {}
): Promise<WebhookResponse> {
  logger.info({ url }, 'Sending signed webhook');

  const signature = generateSignature(data, signatureOptions);
  const signatureHeader = options.signatureHeader || 'X-Webhook-Signature';

  return sendWebhook({
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [signatureHeader]: signature,
      ...options.headers,
    },
    body: data,
    auth: options.auth,
  });
}

/**
 * Parse webhook headers from request
 */
export function parseWebhookHeaders(headers: Record<string, string | string[] | undefined>): {
  signature?: string;
  timestamp?: number;
  eventType?: string;
  requestId?: string;
} {
  const getValue = (key: string): string | undefined => {
    const value = headers[key] || headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    signature:
      getValue('X-Webhook-Signature') ||
      getValue('X-Hub-Signature') ||
      getValue('X-Signature'),
    timestamp: getValue('X-Webhook-Timestamp')
      ? parseInt(getValue('X-Webhook-Timestamp')!, 10)
      : undefined,
    eventType: getValue('X-Event-Type') || getValue('X-Webhook-Event'),
    requestId: getValue('X-Request-Id') || getValue('X-Webhook-Id'),
  };
}

/**
 * Validate webhook timestamp (prevent replay attacks)
 */
export function validateWebhookTimestamp(
  timestamp: number,
  toleranceSeconds: number = 300
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const difference = Math.abs(now - timestamp);

  const isValid = difference <= toleranceSeconds;

  logger.info(
    {
      timestamp,
      now,
      difference,
      toleranceSeconds,
      isValid,
    },
    'Validating webhook timestamp'
  );

  return isValid;
}

/**
 * Create webhook URL with query parameters
 */
export function buildWebhookUrl(
  baseUrl: string,
  params: Record<string, string | number | boolean>
): string {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, String(value));
  }

  return url.toString();
}

/**
 * Send batch webhooks (parallel)
 */
export async function sendBatchWebhooks(
  requests: WebhookRequest[]
): Promise<Array<WebhookResponse | Error>> {
  logger.info({ count: requests.length }, 'Sending batch webhooks');

  const results = await Promise.allSettled(requests.map((req) => sendWebhook(req)));

  const responses = results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return result.reason instanceof Error ? result.reason : new Error('Unknown error');
    }
  });

  const successCount = responses.filter((r) => !(r instanceof Error)).length;
  const failureCount = responses.length - successCount;

  logger.info({ total: responses.length, successCount, failureCount }, 'Batch webhooks completed');

  return responses;
}

/**
 * Send webhooks sequentially
 */
export async function sendSequentialWebhooks(
  requests: WebhookRequest[],
  options: { stopOnError?: boolean; delayBetween?: number } = {}
): Promise<Array<WebhookResponse | Error>> {
  logger.info({ count: requests.length, options }, 'Sending sequential webhooks');

  const responses: Array<WebhookResponse | Error> = [];

  for (let i = 0; i < requests.length; i++) {
    try {
      const response = await sendWebhook(requests[i]);
      responses.push(response);

      // Add delay between requests if specified
      if (options.delayBetween && i < requests.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, options.delayBetween));
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      responses.push(err);

      if (options.stopOnError) {
        logger.warn({ index: i, total: requests.length }, 'Stopping sequential webhooks on error');
        break;
      }
    }
  }

  const successCount = responses.filter((r) => !(r instanceof Error)).length;
  const failureCount = responses.length - successCount;

  logger.info(
    { total: responses.length, successCount, failureCount },
    'Sequential webhooks completed'
  );

  return responses;
}

import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * HelloSign (Dropbox Sign) Module
 *
 * Create and manage digital signature requests
 * - Create signature requests
 * - Send documents for signature
 * - Get signature request status
 * - Download signed PDFs
 * - Add signers and fields
 * - Track signature events
 * - Built-in resilience
 *
 * Perfect for:
 * - Simple document signing workflows
 * - Contract automation
 * - Agreement management
 * - Approval processes
 */

const HELLOSIGN_API_KEY = process.env.HELLOSIGN_API_KEY;
const HELLOSIGN_BASE_URL = 'https://api.hellosign.com/v3';

if (!HELLOSIGN_API_KEY) {
  logger.warn('⚠️  HELLOSIGN_API_KEY not set. HelloSign features will not work.');
}

// Rate limiter: HelloSign has rate limits per API key
const hellosignRateLimiter = createRateLimiter({
  maxConcurrent: 3,
  minTime: 300, // 300ms between requests
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60000,
  id: 'hellosign',
});

export interface HelloSignSigner {
  email_address: string;
  name: string;
  order?: number;
}

export interface HelloSignSignatureRequest {
  signature_request_id?: string;
  title?: string;
  subject?: string;
  message?: string;
  signers: HelloSignSigner[];
  files?: Array<Buffer | string>;
  file_urls?: string[];
  test_mode?: boolean;
  metadata?: Record<string, string>;
}

export interface HelloSignSignatureRequestResponse {
  signature_request_id: string;
  title: string | null;
  subject: string | null;
  message: string | null;
  is_complete: boolean;
  is_declined: boolean;
  has_error: boolean;
  files_url: string;
  signing_url: string | null;
  details_url: string;
  signatures: Array<{
    signature_id: string;
    signer_email_address: string;
    signer_name: string;
    status_code: string;
    signed_at: number | null;
  }>;
}

/**
 * Make authenticated request to HelloSign API
 */
async function makeHelloSignRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: FormData | Record<string, unknown>
): Promise<T> {
  if (!HELLOSIGN_API_KEY) {
    throw new Error('HelloSign API key not configured. Set HELLOSIGN_API_KEY.');
  }

  const url = `${HELLOSIGN_BASE_URL}${endpoint}`;
  const headers: HeadersInit = {
    'Authorization': `Basic ${Buffer.from(HELLOSIGN_API_KEY + ':').toString('base64')}`,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
      // Don't set Content-Type for FormData, let browser set it with boundary
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  logger.info({ method, endpoint }, 'Making HelloSign API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HelloSign API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Create signature request from files
 */
async function createSignatureRequestInternal(
  request: HelloSignSignatureRequest
): Promise<HelloSignSignatureRequestResponse> {
  logger.info(
    { signerCount: request.signers.length, title: request.title },
    'Creating HelloSign signature request'
  );

  const formData = new FormData();

  if (request.title) formData.append('title', request.title);
  if (request.subject) formData.append('subject', request.subject);
  if (request.message) formData.append('message', request.message);
  if (request.test_mode) formData.append('test_mode', '1');

  request.signers.forEach((signer, index) => {
    formData.append(`signers[${index}][email_address]`, signer.email_address);
    formData.append(`signers[${index}][name]`, signer.name);
    if (signer.order !== undefined) {
      formData.append(`signers[${index}][order]`, signer.order.toString());
    }
  });

  if (request.file_urls) {
    request.file_urls.forEach((url, index) => {
      formData.append(`file_url[${index}]`, url);
    });
  }

  if (request.metadata) {
    Object.entries(request.metadata).forEach(([key, value]) => {
      formData.append(`metadata[${key}]`, value);
    });
  }

  const result = await makeHelloSignRequest<{
    signature_request: HelloSignSignatureRequestResponse;
  }>('/signature_request/send', 'POST', formData);

  logger.info(
    { signatureRequestId: result.signature_request.signature_request_id },
    'HelloSign signature request created'
  );
  return result.signature_request;
}

const createSignatureRequestWithBreaker = createCircuitBreaker(
  createSignatureRequestInternal,
  {
    timeout: 30000,
    name: 'hellosign-create-signature-request',
  }
);

const createSignatureRequestRateLimited = withRateLimit(
  async (request: HelloSignSignatureRequest) =>
    createSignatureRequestWithBreaker.fire(request),
  hellosignRateLimiter
);

export async function createSignatureRequest(
  request: HelloSignSignatureRequest
): Promise<HelloSignSignatureRequestResponse> {
  return (await createSignatureRequestRateLimited(
    request
  )) as unknown as HelloSignSignatureRequestResponse;
}

/**
 * Create signature request with template
 */
export async function createSignatureRequestFromTemplate(
  templateId: string,
  signers: HelloSignSigner[],
  options?: {
    title?: string;
    subject?: string;
    message?: string;
    test_mode?: boolean;
    metadata?: Record<string, string>;
  }
): Promise<HelloSignSignatureRequestResponse> {
  logger.info(
    { templateId, signerCount: signers.length },
    'Creating HelloSign signature request from template'
  );

  const formData = new FormData();
  formData.append('template_id', templateId);

  if (options?.title) formData.append('title', options.title);
  if (options?.subject) formData.append('subject', options.subject);
  if (options?.message) formData.append('message', options.message);
  if (options?.test_mode) formData.append('test_mode', '1');

  signers.forEach((signer, index) => {
    formData.append(`signers[${index}][email_address]`, signer.email_address);
    formData.append(`signers[${index}][name]`, signer.name);
    if (signer.order !== undefined) {
      formData.append(`signers[${index}][order]`, signer.order.toString());
    }
  });

  if (options?.metadata) {
    Object.entries(options.metadata).forEach(([key, value]) => {
      formData.append(`metadata[${key}]`, value);
    });
  }

  const result = await makeHelloSignRequest<{
    signature_request: HelloSignSignatureRequestResponse;
  }>('/signature_request/send_with_template', 'POST', formData);

  logger.info(
    { signatureRequestId: result.signature_request.signature_request_id },
    'HelloSign signature request created from template'
  );
  return result.signature_request;
}

/**
 * Get signature request status
 */
export async function getSignatureRequestStatus(
  signatureRequestId: string
): Promise<HelloSignSignatureRequestResponse> {
  logger.info({ signatureRequestId }, 'Getting HelloSign signature request status');

  const result = await makeHelloSignRequest<{
    signature_request: HelloSignSignatureRequestResponse;
  }>(`/signature_request/${signatureRequestId}`, 'GET');

  logger.info(
    {
      signatureRequestId,
      isComplete: result.signature_request.is_complete,
      isDeclined: result.signature_request.is_declined,
    },
    'HelloSign signature request status retrieved'
  );
  return result.signature_request;
}

/**
 * List signature requests
 */
export async function listSignatureRequests(options?: {
  page?: number;
  pageSize?: number;
}): Promise<{
  list_info: {
    num_pages: number;
    num_results: number;
    page: number;
    page_size: number;
  };
  signature_requests: HelloSignSignatureRequestResponse[];
}> {
  logger.info('Listing HelloSign signature requests');

  const params: string[] = [];
  if (options?.page) params.push(`page=${options.page}`);
  if (options?.pageSize) params.push(`page_size=${options.pageSize}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeHelloSignRequest<{
    list_info: {
      num_pages: number;
      num_results: number;
      page: number;
      page_size: number;
    };
    signature_requests: HelloSignSignatureRequestResponse[];
  }>(`/signature_request/list${queryString}`, 'GET');

  logger.info(
    { requestCount: result.signature_requests.length },
    'HelloSign signature requests listed'
  );
  return result;
}

/**
 * Download signed files
 */
export async function downloadSignedFiles(
  signatureRequestId: string,
  fileType: 'pdf' | 'zip' = 'pdf'
): Promise<Blob> {
  if (!HELLOSIGN_API_KEY) {
    throw new Error('HelloSign API key not configured. Set HELLOSIGN_API_KEY.');
  }

  logger.info({ signatureRequestId, fileType }, 'Downloading HelloSign signed files');

  const url = `${HELLOSIGN_BASE_URL}/signature_request/files/${signatureRequestId}?file_type=${fileType}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${Buffer.from(HELLOSIGN_API_KEY + ':').toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download signed files: ${response.statusText}`);
  }

  const blob = await response.blob();
  logger.info(
    { signatureRequestId, fileType, size: blob.size },
    'HelloSign signed files downloaded'
  );
  return blob;
}

/**
 * Cancel signature request
 */
export async function cancelSignatureRequest(
  signatureRequestId: string
): Promise<void> {
  logger.info({ signatureRequestId }, 'Canceling HelloSign signature request');

  await makeHelloSignRequest(
    `/signature_request/cancel/${signatureRequestId}`,
    'POST'
  );

  logger.info({ signatureRequestId }, 'HelloSign signature request canceled');
}

/**
 * Remind signer
 */
export async function remindSigner(
  signatureRequestId: string,
  emailAddress: string
): Promise<{ signature_request: HelloSignSignatureRequestResponse }> {
  logger.info({ signatureRequestId, emailAddress }, 'Sending HelloSign reminder');

  const result = await makeHelloSignRequest<{
    signature_request: HelloSignSignatureRequestResponse;
  }>(`/signature_request/remind/${signatureRequestId}`, 'POST', {
    email_address: emailAddress,
  });

  logger.info({ signatureRequestId, emailAddress }, 'HelloSign reminder sent');
  return result;
}

/**
 * Get embedded signing URL
 */
export async function getEmbeddedSigningUrl(
  signatureId: string
): Promise<{ sign_url: string; expires_at: number }> {
  logger.info({ signatureId }, 'Getting HelloSign embedded signing URL');

  const result = await makeHelloSignRequest<{
    embedded: { sign_url: string; expires_at: number };
  }>(`/embedded/sign_url/${signatureId}`, 'GET');

  logger.info({ signatureId, expiresAt: result.embedded.expires_at }, 'HelloSign signing URL retrieved');
  return result.embedded;
}

/**
 * Get account information
 */
export async function getAccountInfo(): Promise<{
  account_id: string;
  email_address: string;
  is_locked: boolean;
  is_paid_hs: boolean;
  is_paid_hf: boolean;
  quotas: {
    documents_left: number | null;
    templates_left: number | null;
  };
}> {
  logger.info('Getting HelloSign account info');

  const result = await makeHelloSignRequest<{
    account: {
      account_id: string;
      email_address: string;
      is_locked: boolean;
      is_paid_hs: boolean;
      is_paid_hf: boolean;
      quotas: {
        documents_left: number | null;
        templates_left: number | null;
      };
    };
  }>('/account', 'GET');

  logger.info('HelloSign account info retrieved');
  return result.account;
}

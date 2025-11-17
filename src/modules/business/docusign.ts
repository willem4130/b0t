import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * DocuSign Module
 *
 * Create and manage digital signature workflows
 * - Create envelopes
 * - Send documents for signature
 * - Get envelope status
 * - Download signed documents
 * - Add recipients and signers
 * - Track signature events
 * - Built-in resilience
 *
 * Perfect for:
 * - Contract automation
 * - Document signing workflows
 * - Legal agreement management
 * - Approval workflows
 */

const DOCUSIGN_ACCESS_TOKEN = process.env.DOCUSIGN_ACCESS_TOKEN;
const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;
const DOCUSIGN_BASE_URL = process.env.DOCUSIGN_BASE_URL || 'https://demo.docusign.net/restapi';

if (!DOCUSIGN_ACCESS_TOKEN || !DOCUSIGN_ACCOUNT_ID) {
  logger.warn(
    '⚠️  DOCUSIGN_ACCESS_TOKEN or DOCUSIGN_ACCOUNT_ID not set. DocuSign features will not work.'
  );
}

// Rate limiter: DocuSign has rate limits per account
const docusignRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 200, // 200ms between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60000,
  id: 'docusign',
});

export interface DocuSignRecipient {
  email: string;
  name: string;
  recipientId: string;
  routingOrder?: string;
  tabs?: {
    signHereTabs?: Array<{
      documentId: string;
      pageNumber: string;
      xPosition: string;
      yPosition: string;
    }>;
    dateSignedTabs?: Array<{
      documentId: string;
      pageNumber: string;
      xPosition: string;
      yPosition: string;
    }>;
  };
}

export interface DocuSignDocument {
  documentId: string;
  name: string;
  documentBase64?: string;
  fileExtension?: string;
}

export interface DocuSignEnvelope {
  envelopeId?: string;
  emailSubject: string;
  status: 'created' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined' | 'voided';
  documents: DocuSignDocument[];
  recipients: {
    signers: DocuSignRecipient[];
  };
  [key: string]: unknown;
}

export interface DocuSignEnvelopeStatus {
  envelopeId: string;
  status: string;
  statusChangedDateTime: string;
  documentsUri: string;
  recipientsUri: string;
  emailSubject: string;
}

/**
 * Make authenticated request to DocuSign API
 */
async function makeDocuSignRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  if (!DOCUSIGN_ACCESS_TOKEN || !DOCUSIGN_ACCOUNT_ID) {
    throw new Error(
      'DocuSign credentials not configured. Set DOCUSIGN_ACCESS_TOKEN and DOCUSIGN_ACCOUNT_ID.'
    );
  }

  const url = `${DOCUSIGN_BASE_URL}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${DOCUSIGN_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info({ method, endpoint }, 'Making DocuSign API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DocuSign API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Create envelope
 */
async function createEnvelopeInternal(
  envelope: DocuSignEnvelope
): Promise<{ envelopeId: string; status: string; statusDateTime: string }> {
  logger.info(
    { emailSubject: envelope.emailSubject, status: envelope.status },
    'Creating DocuSign envelope'
  );

  const result = await makeDocuSignRequest<{
    envelopeId: string;
    status: string;
    statusDateTime: string;
  }>('/envelopes', 'POST', envelope);

  logger.info({ envelopeId: result.envelopeId }, 'DocuSign envelope created');
  return result;
}

const createEnvelopeWithBreaker = createCircuitBreaker(createEnvelopeInternal, {
  timeout: 30000,
  name: 'docusign-create-envelope',
});

const createEnvelopeRateLimited = withRateLimit(
  async (envelope: DocuSignEnvelope) => createEnvelopeWithBreaker.fire(envelope),
  docusignRateLimiter
);

export async function createEnvelope(
  envelope: DocuSignEnvelope
): Promise<{ envelopeId: string; status: string; statusDateTime: string }> {
  return (await createEnvelopeRateLimited(envelope)) as unknown as {
    envelopeId: string;
    status: string;
    statusDateTime: string;
  };
}

/**
 * Create and send envelope (convenience method)
 */
export async function createAndSendEnvelope(
  emailSubject: string,
  documents: DocuSignDocument[],
  signers: DocuSignRecipient[]
): Promise<{ envelopeId: string; status: string; statusDateTime: string }> {
  const envelope: DocuSignEnvelope = {
    emailSubject,
    status: 'sent',
    documents,
    recipients: {
      signers,
    },
  };

  return createEnvelope(envelope);
}

/**
 * Get envelope status
 */
export async function getEnvelopeStatus(
  envelopeId: string
): Promise<DocuSignEnvelopeStatus> {
  logger.info({ envelopeId }, 'Getting DocuSign envelope status');

  const result = await makeDocuSignRequest<DocuSignEnvelopeStatus>(
    `/envelopes/${envelopeId}`,
    'GET'
  );

  logger.info({ envelopeId, status: result.status }, 'DocuSign envelope status retrieved');
  return result;
}

/**
 * List envelopes
 */
export async function listEnvelopes(options?: {
  fromDate?: string;
  toDate?: string;
  status?: string;
  count?: number;
}): Promise<{
  envelopes: Array<{
    envelopeId: string;
    status: string;
    emailSubject: string;
    statusChangedDateTime: string;
  }>;
  totalSetSize: string;
}> {
  logger.info('Listing DocuSign envelopes');

  const params: string[] = [];
  if (options?.fromDate) params.push(`from_date=${options.fromDate}`);
  if (options?.toDate) params.push(`to_date=${options.toDate}`);
  if (options?.status) params.push(`status=${options.status}`);
  if (options?.count) params.push(`count=${options.count}`);

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  const result = await makeDocuSignRequest<{
    envelopes: Array<{
      envelopeId: string;
      status: string;
      emailSubject: string;
      statusChangedDateTime: string;
    }>;
    totalSetSize: string;
  }>(`/envelopes${queryString}`, 'GET');

  logger.info(
    { envelopeCount: result.envelopes.length },
    'DocuSign envelopes listed'
  );
  return result;
}

/**
 * Get envelope documents
 */
export async function getEnvelopeDocuments(
  envelopeId: string
): Promise<{
  envelopeId: string;
  envelopeDocuments: Array<{
    documentId: string;
    name: string;
    type: string;
    uri: string;
  }>;
}> {
  logger.info({ envelopeId }, 'Getting DocuSign envelope documents');

  const result = await makeDocuSignRequest<{
    envelopeId: string;
    envelopeDocuments: Array<{
      documentId: string;
      name: string;
      type: string;
      uri: string;
    }>;
  }>(`/envelopes/${envelopeId}/documents`, 'GET');

  logger.info(
    { envelopeId, documentCount: result.envelopeDocuments.length },
    'DocuSign envelope documents retrieved'
  );
  return result;
}

/**
 * Download envelope document
 */
export async function downloadEnvelopeDocument(
  envelopeId: string,
  documentId: string
): Promise<Blob> {
  if (!DOCUSIGN_ACCESS_TOKEN || !DOCUSIGN_ACCOUNT_ID) {
    throw new Error(
      'DocuSign credentials not configured. Set DOCUSIGN_ACCESS_TOKEN and DOCUSIGN_ACCOUNT_ID.'
    );
  }

  logger.info({ envelopeId, documentId }, 'Downloading DocuSign document');

  const url = `${DOCUSIGN_BASE_URL}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/${documentId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${DOCUSIGN_ACCESS_TOKEN}`,
      'Accept': 'application/pdf',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download document: ${response.statusText}`);
  }

  const blob = await response.blob();
  logger.info({ envelopeId, documentId, size: blob.size }, 'DocuSign document downloaded');
  return blob;
}

/**
 * Download all envelope documents as combined PDF
 */
export async function downloadCombinedDocuments(envelopeId: string): Promise<Blob> {
  return downloadEnvelopeDocument(envelopeId, 'combined');
}

/**
 * Get envelope recipients
 */
export async function getEnvelopeRecipients(
  envelopeId: string
): Promise<{
  signers: Array<{
    email: string;
    name: string;
    recipientId: string;
    status: string;
    signedDateTime?: string;
  }>;
}> {
  logger.info({ envelopeId }, 'Getting DocuSign envelope recipients');

  const result = await makeDocuSignRequest<{
    signers: Array<{
      email: string;
      name: string;
      recipientId: string;
      status: string;
      signedDateTime?: string;
    }>;
  }>(`/envelopes/${envelopeId}/recipients`, 'GET');

  logger.info(
    { envelopeId, recipientCount: result.signers.length },
    'DocuSign envelope recipients retrieved'
  );
  return result;
}

/**
 * Void envelope
 */
export async function voidEnvelope(
  envelopeId: string,
  voidedReason: string
): Promise<{ voidedDateTime: string; voidedReason: string }> {
  logger.info({ envelopeId, voidedReason }, 'Voiding DocuSign envelope');

  const result = await makeDocuSignRequest<{
    voidedDateTime: string;
    voidedReason: string;
  }>(
    `/envelopes/${envelopeId}`,
    'PUT',
    {
      status: 'voided',
      voidedReason,
    }
  );

  logger.info({ envelopeId }, 'DocuSign envelope voided');
  return result;
}

/**
 * Resend envelope
 */
export async function resendEnvelope(envelopeId: string): Promise<void> {
  logger.info({ envelopeId }, 'Resending DocuSign envelope');

  await makeDocuSignRequest(`/envelopes/${envelopeId}?resend_envelope=true`, 'PUT', {
    resendEnvelope: 'true',
  });

  logger.info({ envelopeId }, 'DocuSign envelope resent');
}

/**
 * Get envelope audit events
 */
export async function getEnvelopeAuditEvents(
  envelopeId: string
): Promise<{
  auditEvents: Array<{
    eventTimestamp: string;
    eventFields: Array<{
      name: string;
      value: string;
    }>;
  }>;
}> {
  logger.info({ envelopeId }, 'Getting DocuSign envelope audit events');

  const result = await makeDocuSignRequest<{
    auditEvents: Array<{
      eventTimestamp: string;
      eventFields: Array<{
        name: string;
        value: string;
      }>;
    }>;
  }>(`/envelopes/${envelopeId}/audit_events`, 'GET');

  logger.info(
    { envelopeId, eventCount: result.auditEvents.length },
    'DocuSign audit events retrieved'
  );
  return result;
}

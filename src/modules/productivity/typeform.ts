import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Typeform Module
 *
 * Create and manage Typeform surveys and forms
 * - Get form information
 * - List forms
 * - Get form responses
 * - Create forms
 * - Built-in resilience
 *
 * Perfect for:
 * - Survey automation
 * - Feedback collection
 * - Lead generation
 * - Data collection workflows
 */

const TYPEFORM_API_KEY = process.env.TYPEFORM_API_KEY;

if (!TYPEFORM_API_KEY) {
  logger.warn('⚠️  TYPEFORM_API_KEY not set. Typeform features will not work.');
}

const TYPEFORM_API_BASE = 'https://api.typeform.com';

// Rate limiter: Typeform allows 60 req/min for most endpoints
const typeformRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 1000, // 1000ms between requests = 60/min
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60000,
  id: 'typeform',
});

export interface TypeformForm {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface TypeformResponse {
  response_id: string;
  submitted_at: string;
  answers: Array<{
    field: { id: string; type: string };
    text?: string;
    email?: string;
    number?: number;
    choice?: { label: string };
  }>;
}

/**
 * Get form information (internal)
 */
async function getFormInternal(formId: string): Promise<TypeformForm> {
  if (!TYPEFORM_API_KEY) {
    throw new Error('Typeform API key not set. Set TYPEFORM_API_KEY.');
  }

  logger.info({ formId }, 'Fetching Typeform form');

  const response = await fetch(`${TYPEFORM_API_BASE}/forms/${formId}`, {
    headers: {
      Authorization: `Bearer ${TYPEFORM_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Typeform API error: ${response.statusText}`);
  }

  const form = (await response.json()) as TypeformForm;

  logger.info({ formId, title: form.title }, 'Typeform form fetched');
  return form;
}

/**
 * Get form (protected)
 */
const getFormWithBreaker = createCircuitBreaker(getFormInternal, {
  timeout: 10000,
  name: 'typeform-get-form',
});

export const getForm = withRateLimit(
  (formId: string) => getFormWithBreaker.fire(formId),
  typeformRateLimiter
);

/**
 * List all forms (internal)
 */
async function listFormsInternal(): Promise<TypeformForm[]> {
  if (!TYPEFORM_API_KEY) {
    throw new Error('Typeform API key not set. Set TYPEFORM_API_KEY.');
  }

  logger.info({}, 'Listing Typeform forms');

  const response = await fetch(`${TYPEFORM_API_BASE}/forms`, {
    headers: {
      Authorization: `Bearer ${TYPEFORM_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Typeform API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { items: TypeformForm[] };

  logger.info({ formCount: data.items.length }, 'Typeform forms listed');
  return data.items;
}

/**
 * List forms (protected)
 */
const listFormsWithBreaker = createCircuitBreaker(listFormsInternal, {
  timeout: 10000,
  name: 'typeform-list-forms',
});

export const listForms = withRateLimit(
  () => listFormsWithBreaker.fire(),
  typeformRateLimiter
);

/**
 * Get form responses (internal)
 */
async function getResponsesInternal(
  formId: string,
  options: { pageSize?: number; since?: string } = {}
): Promise<TypeformResponse[]> {
  if (!TYPEFORM_API_KEY) {
    throw new Error('Typeform API key not set. Set TYPEFORM_API_KEY.');
  }

  logger.info({ formId, pageSize: options.pageSize }, 'Fetching Typeform responses');

  const params = new URLSearchParams({
    page_size: String(options.pageSize || 25),
  });

  if (options.since) {
    params.append('since', options.since);
  }

  const response = await fetch(`${TYPEFORM_API_BASE}/forms/${formId}/responses?${params}`, {
    headers: {
      Authorization: `Bearer ${TYPEFORM_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Typeform API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { items: TypeformResponse[] };

  logger.info({ responseCount: data.items.length }, 'Typeform responses fetched');
  return data.items;
}

/**
 * Get responses (protected)
 */
const getResponsesWithBreaker = createCircuitBreaker(getResponsesInternal, {
  timeout: 15000,
  name: 'typeform-get-responses',
});

export const getResponses = withRateLimit(
  (formId: string, options?: { pageSize?: number; since?: string }) =>
    getResponsesWithBreaker.fire(formId, options),
  typeformRateLimiter
);

/**
 * Create a new form (internal)
 */
async function createFormInternal(
  title: string,
  fields: Array<{ title: string; type: string; required?: boolean }>
): Promise<TypeformForm> {
  if (!TYPEFORM_API_KEY) {
    throw new Error('Typeform API key not set. Set TYPEFORM_API_KEY.');
  }

  logger.info({ title, fieldCount: fields.length }, 'Creating Typeform form');

  const payload = {
    title,
    fields: fields.map((field) => ({
      title: field.title,
      type: field.type,
      required: field.required || false,
    })),
  };

  const response = await fetch(`${TYPEFORM_API_BASE}/forms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TYPEFORM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Typeform API error: ${response.statusText}`);
  }

  const form = (await response.json()) as TypeformForm;

  logger.info({ formId: form.id, title }, 'Typeform form created');
  return form;
}

/**
 * Create form (protected)
 */
const createFormWithBreaker = createCircuitBreaker(createFormInternal, {
  timeout: 15000,
  name: 'typeform-create-form',
});

export const createForm = withRateLimit(
  (title: string, fields: Array<{ title: string; type: string; required?: boolean }>) =>
    createFormWithBreaker.fire(title, fields),
  typeformRateLimiter
);

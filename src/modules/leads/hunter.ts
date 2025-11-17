/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Hunter.io Email Finder Module
 *
 * Find and verify email addresses for lead generation
 * Built with production-grade reliability:
 * - Circuit breaker to prevent hammering failing APIs
 * - Rate limiting (60 req/min for Hunter API limits)
 * - Structured logging
 * - Automatic error handling
 *
 * Perfect for:
 * - Finding email addresses by domain
 * - Verifying email deliverability
 * - Domain search for company contacts
 * - Bulk email verification
 */

// Hunter API rate limiter (60 req/min)
const hunterRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 1000, // 1s between requests = ~60/min
  reservoir: 60,
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000,
  id: 'hunter-api',
});

const HUNTER_API_BASE = 'https://api.hunter.io/v2';

interface HunterConfig {
  apiKey: string;
}

function getApiKey(config?: HunterConfig): string {
  const apiKey = config?.apiKey || process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error('Hunter API key is required. Set HUNTER_API_KEY env var or pass apiKey in config.');
  }
  return apiKey;
}

/**
 * Find email address for a person at a domain
 */
async function findEmailInternal(params: {
  domain: string;
  firstName: string;
  lastName: string;
  apiKey?: string;
}): Promise<{
  email: string | null;
  score: number;
  confidence: number;
  sources: Array<{ domain: string; uri: string }>;
}> {
  const { domain, firstName, lastName } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ domain, firstName, lastName }, 'Finding email with Hunter');

  try {
    const response = await axios.get(`${HUNTER_API_BASE}/email-finder`, {
      params: {
        domain,
        first_name: firstName,
        last_name: lastName,
        api_key: apiKey,
      },
    });

    const { data } = response.data;

    logger.info({ email: data.email, score: data.score }, 'Email found successfully');

    return {
      email: data.email,
      score: data.score,
      confidence: data.confidence,
      sources: data.sources || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Hunter email finder failed');
      throw new Error(`Hunter email finder failed: ${error.response?.data?.errors?.[0]?.details || error.message}`);
    }
    throw error;
  }
}

const findEmailWithBreaker = createCircuitBreaker(findEmailInternal, {
  timeout: 15000,
  name: 'hunter-find-email',
});

export const findEmail = withRateLimit(
  (params: Parameters<typeof findEmailInternal>[0]) => findEmailWithBreaker.fire(params),
  hunterRateLimiter
);

/**
 * Verify email deliverability
 */
async function verifyEmailInternal(params: {
  email: string;
  apiKey?: string;
}): Promise<{
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
  result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
  score: number;
  smtp_check: boolean;
  smtp_server: string | null;
  mx_records: boolean;
}> {
  const { email } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ email }, 'Verifying email with Hunter');

  try {
    const response = await axios.get(`${HUNTER_API_BASE}/email-verifier`, {
      params: {
        email,
        api_key: apiKey,
      },
    });

    const { data } = response.data;

    logger.info({ email, status: data.status, result: data.result, score: data.score }, 'Email verified');

    return {
      status: data.status,
      result: data.result,
      score: data.score,
      smtp_check: data.smtp_check,
      smtp_server: data.smtp_server,
      mx_records: data.mx_records,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Hunter email verification failed');
      throw new Error(`Hunter email verification failed: ${error.response?.data?.errors?.[0]?.details || error.message}`);
    }
    throw error;
  }
}

const verifyEmailWithBreaker = createCircuitBreaker(verifyEmailInternal, {
  timeout: 15000,
  name: 'hunter-verify-email',
});

export const verifyEmail = withRateLimit(
  (params: Parameters<typeof verifyEmailInternal>[0]) => verifyEmailWithBreaker.fire(params),
  hunterRateLimiter
);

/**
 * Search for email addresses at a domain
 */
async function domainSearchInternal(params: {
  domain: string;
  type?: 'personal' | 'generic';
  limit?: number;
  offset?: number;
  apiKey?: string;
}): Promise<{
  domain: string;
  organization: string;
  emails: Array<{
    value: string;
    type: 'personal' | 'generic';
    confidence: number;
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    department: string | null;
    linkedin: string | null;
    twitter: string | null;
  }>;
  total: number;
}> {
  const { domain, type, limit = 10, offset = 0 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ domain, type, limit }, 'Searching domain with Hunter');

  try {
    const response = await axios.get(`${HUNTER_API_BASE}/domain-search`, {
      params: {
        domain,
        type,
        limit,
        offset,
        api_key: apiKey,
      },
    });

    const { data } = response.data;

    logger.info({ domain, emailCount: data.emails?.length || 0 }, 'Domain search completed');

    return {
      domain: data.domain,
      organization: data.organization,
      emails: data.emails || [],
      total: data.meta?.results || 0,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Hunter domain search failed');
      throw new Error(`Hunter domain search failed: ${error.response?.data?.errors?.[0]?.details || error.message}`);
    }
    throw error;
  }
}

const domainSearchWithBreaker = createCircuitBreaker(domainSearchInternal, {
  timeout: 15000,
  name: 'hunter-domain-search',
});

export const domainSearch = withRateLimit(
  (params: Parameters<typeof domainSearchInternal>[0]) => domainSearchWithBreaker.fire(params),
  hunterRateLimiter
);

/**
 * Get email count for a domain
 */
async function getEmailCountInternal(params: {
  domain: string;
  apiKey?: string;
}): Promise<{
  total: number;
  personal: number;
  generic: number;
}> {
  const { domain } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ domain }, 'Getting email count with Hunter');

  try {
    const response = await axios.get(`${HUNTER_API_BASE}/email-count`, {
      params: {
        domain,
        api_key: apiKey,
      },
    });

    const { data } = response.data;

    logger.info({ domain, total: data.total }, 'Email count retrieved');

    return {
      total: data.total,
      personal: data.personal_emails,
      generic: data.generic_emails,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Hunter email count failed');
      throw new Error(`Hunter email count failed: ${error.response?.data?.errors?.[0]?.details || error.message}`);
    }
    throw error;
  }
}

const getEmailCountWithBreaker = createCircuitBreaker(getEmailCountInternal, {
  timeout: 10000,
  name: 'hunter-email-count',
});

export const getEmailCount = withRateLimit(
  (params: Parameters<typeof getEmailCountInternal>[0]) => getEmailCountWithBreaker.fire(params),
  hunterRateLimiter
);

/**
 * Bulk verify emails (up to 50 at once)
 */
async function bulkVerifyInternal(params: {
  emails: string[];
  apiKey?: string;
}): Promise<Array<{
  email: string;
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
  result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
  score: number;
}>> {
  const { emails } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  if (emails.length > 50) {
    throw new Error('Hunter bulk verify supports max 50 emails at once');
  }

  logger.info({ emailCount: emails.length }, 'Bulk verifying emails with Hunter');

  try {
    // Hunter bulk verify requires sending emails as comma-separated list
    const response = await axios.post(
      `${HUNTER_API_BASE}/email-verifier/bulk`,
      {
        emails: emails.join(','),
        api_key: apiKey,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { data } = response.data;

    logger.info({ verifiedCount: data.length }, 'Bulk email verification completed');

    return data.map((item: Record<string, unknown>) => ({
      email: item.email,
      status: item.status,
      result: item.result,
      score: item.score,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Hunter bulk verify failed');
      throw new Error(`Hunter bulk verify failed: ${error.response?.data?.errors?.[0]?.details || error.message}`);
    }
    throw error;
  }
}

const bulkVerifyWithBreaker = createCircuitBreaker(bulkVerifyInternal, {
  timeout: 30000,
  name: 'hunter-bulk-verify',
});

export const bulkVerify = withRateLimit(
  (params: Parameters<typeof bulkVerifyInternal>[0]) => bulkVerifyWithBreaker.fire(params),
  hunterRateLimiter
);

/**
 * Get account information and usage
 */
async function getAccountInfoInternal(params: {
  apiKey?: string;
}): Promise<{
  email: string;
  plan_name: string;
  requests_available: number;
  requests_used: number;
  reset_date: string;
}> {
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info('Getting Hunter account info');

  try {
    const response = await axios.get(`${HUNTER_API_BASE}/account`, {
      params: {
        api_key: apiKey,
      },
    });

    const { data } = response.data;

    logger.info(
      {
        plan: data.plan_name,
        available: data.requests.searches.available,
        used: data.requests.searches.used,
      },
      'Account info retrieved'
    );

    return {
      email: data.email,
      plan_name: data.plan_name,
      requests_available: data.requests.searches.available,
      requests_used: data.requests.searches.used,
      reset_date: data.reset_date,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Hunter account info failed');
      throw new Error(`Hunter account info failed: ${error.response?.data?.errors?.[0]?.details || error.message}`);
    }
    throw error;
  }
}

const getAccountInfoWithBreaker = createCircuitBreaker(getAccountInfoInternal, {
  timeout: 10000,
  name: 'hunter-account-info',
});

export const getAccountInfo = withRateLimit(
  (params: Parameters<typeof getAccountInfoInternal>[0]) => getAccountInfoWithBreaker.fire(params),
  hunterRateLimiter
);

/**
 * Search for leads at a company
 */
async function searchLeadsInternal(params: {
  company: string;
  limit?: number;
  offset?: number;
  apiKey?: string;
}): Promise<{
  company: string;
  domain: string;
  leads: Array<{
    email: string;
    firstName: string | null;
    lastName: string | null;
    position: string | null;
    department: string | null;
    confidence: number;
    linkedin: string | null;
    twitter: string | null;
  }>;
  total: number;
}> {
  const { company, limit = 10, offset = 0 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ company, limit }, 'Searching leads by company with Hunter');

  try {
    const response = await axios.get(`${HUNTER_API_BASE}/domain-search`, {
      params: {
        company,
        limit,
        offset,
        api_key: apiKey,
      },
    });

    const { data } = response.data;

    logger.info({ company, leadsCount: data.emails?.length || 0 }, 'Lead search completed');

    return {
      company: data.organization,
      domain: data.domain,
      leads: (data.emails || []).map((email: Record<string, unknown>) => ({
        email: email.value,
        firstName: email.first_name,
        lastName: email.last_name,
        position: email.position,
        department: email.department,
        confidence: email.confidence,
        linkedin: email.linkedin,
        twitter: email.twitter,
      })),
      total: data.meta?.results || 0,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Hunter lead search failed');
      throw new Error(`Hunter lead search failed: ${error.response?.data?.errors?.[0]?.details || error.message}`);
    }
    throw error;
  }
}

const searchLeadsWithBreaker = createCircuitBreaker(searchLeadsInternal, {
  timeout: 15000,
  name: 'hunter-search-leads',
});

export const searchLeads = withRateLimit(
  (params: Parameters<typeof searchLeadsInternal>[0]) => searchLeadsWithBreaker.fire(params),
  hunterRateLimiter
);

/**
 * Validate email format (client-side, no API call)
 */
export async function validateEmailFormat(email: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  logger.info({ email }, 'Validating email format');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return {
      valid: false,
      error: 'Invalid email format',
    };
  }

  // Additional checks
  if (email.length > 254) {
    return {
      valid: false,
      error: 'Email too long (max 254 characters)',
    };
  }

  const [localPart, domain] = email.split('@');

  if (localPart.length > 64) {
    return {
      valid: false,
      error: 'Local part too long (max 64 characters)',
    };
  }

  if (domain.includes('..')) {
    return {
      valid: false,
      error: 'Invalid domain (consecutive dots)',
    };
  }

  logger.info({ email, valid: true }, 'Email format validated');

  return {
    valid: true,
  };
}

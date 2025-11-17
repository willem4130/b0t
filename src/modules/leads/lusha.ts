/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Lusha Contact Finder Module
 *
 * Find and enrich contact information (email and phone)
 * Built with production-grade reliability:
 * - Circuit breaker to prevent hammering failing APIs
 * - Rate limiting (200 req/min for Lusha API limits)
 * - Structured logging
 * - Automatic error handling
 *
 * Perfect for:
 * - Enriching contact information
 * - Finding emails and phone numbers
 * - Bulk contact enrichment
 * - LinkedIn profile enrichment
 */

// Lusha API rate limiter (200 req/min)
const lushaRateLimiter = createRateLimiter({
  maxConcurrent: 15,
  minTime: 300, // 300ms between requests = ~200/min
  reservoir: 200,
  reservoirRefreshAmount: 200,
  reservoirRefreshInterval: 60 * 1000,
  id: 'lusha-api',
});

const LUSHA_API_BASE = 'https://api.lusha.com';

interface LushaConfig {
  apiKey: string;
}

function getApiKey(config?: LushaConfig): string {
  const apiKey = config?.apiKey || process.env.LUSHA_API_KEY;
  if (!apiKey) {
    throw new Error('Lusha API key is required. Set LUSHA_API_KEY env var or pass apiKey in config.');
  }
  return apiKey;
}

/**
 * Enrich contact information
 */
async function enrichContactInternal(params: {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companydomain?: string;
  linkedinUrl?: string;
  apiKey?: string;
}): Promise<{
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: {
    name: string;
    domain: string;
    industry: string;
  };
  emails: Array<{
    email: string;
    type: string;
    status: string;
  }>;
  phoneNumbers: Array<{
    number: string;
    type: string;
    country: string;
  }>;
  linkedin: string | null;
  location: {
    city: string;
    state: string;
    country: string;
  };
}> {
  const { firstName, lastName, companyName, companydomain, linkedinUrl } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ firstName, lastName, companyName }, 'Enriching contact with Lusha');

  try {
    const response = await axios.post(
      `${LUSHA_API_BASE}/person`,
      {
        property: {
          firstName,
          lastName,
          company: companyName,
          domain: companydomain,
          linkedInUrl: linkedinUrl,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiKey,
        },
      }
    );

    const person = response.data.data;

    logger.info({ firstName, lastName, emailCount: person.emails?.length || 0 }, 'Contact enriched successfully');

    return {
      firstName: person.firstName,
      lastName: person.lastName,
      jobTitle: person.jobTitle,
      company: {
        name: person.company,
        domain: person.companyDomain,
        industry: person.industry,
      },
      emails: (person.emails || []).map((email: Record<string, unknown>) => ({
        email: email.value,
        type: email.type,
        status: email.status,
      })),
      phoneNumbers: (person.phoneNumbers || []).map((phone: Record<string, unknown>) => ({
        number: phone.value,
        type: phone.type,
        country: phone.countryCode,
      })),
      linkedin: person.linkedInUrl,
      location: {
        city: person.city,
        state: person.state,
        country: person.country,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Lusha contact enrichment failed');
      throw new Error(`Lusha contact enrichment failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const enrichContactWithBreaker = createCircuitBreaker(enrichContactInternal, {
  timeout: 15000,
  name: 'lusha-enrich-contact',
});

export const enrichContact = withRateLimit(
  (params: Parameters<typeof enrichContactInternal>[0]) => enrichContactWithBreaker.fire(params),
  lushaRateLimiter
);

/**
 * Find email by name and company
 */
async function findEmailInternal(params: {
  firstName: string;
  lastName: string;
  companyDomain: string;
  apiKey?: string;
}): Promise<{
  email: string;
  type: string;
  status: string;
  confidence: number;
}> {
  const { firstName, lastName, companyDomain } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ firstName, lastName, companyDomain }, 'Finding email with Lusha');

  try {
    const response = await axios.post(
      `${LUSHA_API_BASE}/email`,
      {
        property: {
          firstName,
          lastName,
          domain: companyDomain,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiKey,
        },
      }
    );

    const { email } = response.data.data;

    logger.info({ email: email.value }, 'Email found successfully');

    return {
      email: email.value,
      type: email.type,
      status: email.status,
      confidence: email.confidence,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Lusha email finder failed');
      throw new Error(`Lusha email finder failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const findEmailWithBreaker = createCircuitBreaker(findEmailInternal, {
  timeout: 15000,
  name: 'lusha-find-email',
});

export const findEmail = withRateLimit(
  (params: Parameters<typeof findEmailInternal>[0]) => findEmailWithBreaker.fire(params),
  lushaRateLimiter
);

/**
 * Find phone number by name and company
 */
async function findPhoneInternal(params: {
  firstName: string;
  lastName: string;
  companyDomain: string;
  apiKey?: string;
}): Promise<{
  number: string;
  type: string;
  country: string;
  confidence: number;
}> {
  const { firstName, lastName, companyDomain } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ firstName, lastName, companyDomain }, 'Finding phone with Lusha');

  try {
    const response = await axios.post(
      `${LUSHA_API_BASE}/phone`,
      {
        property: {
          firstName,
          lastName,
          domain: companyDomain,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiKey,
        },
      }
    );

    const { phone } = response.data.data;

    logger.info({ phone: phone.value }, 'Phone found successfully');

    return {
      number: phone.value,
      type: phone.type,
      country: phone.countryCode,
      confidence: phone.confidence,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Lusha phone finder failed');
      throw new Error(`Lusha phone finder failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const findPhoneWithBreaker = createCircuitBreaker(findPhoneInternal, {
  timeout: 15000,
  name: 'lusha-find-phone',
});

export const findPhone = withRateLimit(
  (params: Parameters<typeof findPhoneInternal>[0]) => findPhoneWithBreaker.fire(params),
  lushaRateLimiter
);

/**
 * Bulk enrich contacts (up to 25 at once)
 */
async function bulkEnrichInternal(params: {
  contacts: Array<{
    firstName: string;
    lastName: string;
    companyDomain: string;
  }>;
  apiKey?: string;
}): Promise<Array<{
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string;
  company: string;
  success: boolean;
  error?: string;
}>> {
  const { contacts } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  if (contacts.length > 25) {
    throw new Error('Lusha bulk enrich supports max 25 contacts at once');
  }

  logger.info({ contactCount: contacts.length }, 'Bulk enriching contacts with Lusha');

  try {
    const response = await axios.post(
      `${LUSHA_API_BASE}/person/bulk`,
      {
        data: contacts.map(c => ({
          firstName: c.firstName,
          lastName: c.lastName,
          domain: c.companyDomain,
        })),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiKey,
        },
      }
    );

    const results = response.data.data;

    logger.info({ enrichedCount: results.length }, 'Bulk enrichment completed');

    return results.map((result: Record<string, unknown>) => ({
      firstName: result.firstName,
      lastName: result.lastName,
      email: result.emails?.[0]?.value || null,
      phone: result.phoneNumbers?.[0]?.value || null,
      jobTitle: result.jobTitle,
      company: result.company,
      success: !result.error,
      error: result.error,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Lusha bulk enrich failed');
      throw new Error(`Lusha bulk enrich failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const bulkEnrichWithBreaker = createCircuitBreaker(bulkEnrichInternal, {
  timeout: 30000,
  name: 'lusha-bulk-enrich',
});

export const bulkEnrich = withRateLimit(
  (params: Parameters<typeof bulkEnrichInternal>[0]) => bulkEnrichWithBreaker.fire(params),
  lushaRateLimiter
);

/**
 * Enrich company information
 */
async function enrichCompanyInternal(params: {
  domain: string;
  apiKey?: string;
}): Promise<{
  name: string;
  domain: string;
  industry: string;
  employeeCount: number;
  revenue: number | null;
  description: string;
  phone: string | null;
  headquarters: {
    city: string;
    state: string;
    country: string;
  };
  linkedin: string | null;
  twitter: string | null;
  facebook: string | null;
}> {
  const { domain } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ domain }, 'Enriching company with Lusha');

  try {
    const response = await axios.post(
      `${LUSHA_API_BASE}/company`,
      {
        property: {
          domain,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiKey,
        },
      }
    );

    const company = response.data.data;

    logger.info({ domain, name: company.name }, 'Company enriched successfully');

    return {
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      employeeCount: company.employeeCount,
      revenue: company.revenue,
      description: company.description,
      phone: company.phone,
      headquarters: {
        city: company.city,
        state: company.state,
        country: company.country,
      },
      linkedin: company.linkedInUrl,
      twitter: company.twitterUrl,
      facebook: company.facebookUrl,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Lusha company enrichment failed');
      throw new Error(`Lusha company enrichment failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const enrichCompanyWithBreaker = createCircuitBreaker(enrichCompanyInternal, {
  timeout: 15000,
  name: 'lusha-enrich-company',
});

export const enrichCompany = withRateLimit(
  (params: Parameters<typeof enrichCompanyInternal>[0]) => enrichCompanyWithBreaker.fire(params),
  lushaRateLimiter
);

/**
 * Enrich from LinkedIn URL
 */
async function enrichFromLinkedInInternal(params: {
  linkedinUrl: string;
  apiKey?: string;
}): Promise<{
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: {
    name: string;
    domain: string;
  };
  email: string | null;
  phone: string | null;
  location: {
    city: string;
    country: string;
  };
}> {
  const { linkedinUrl } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ linkedinUrl }, 'Enriching from LinkedIn with Lusha');

  try {
    const response = await axios.post(
      `${LUSHA_API_BASE}/person`,
      {
        property: {
          linkedInUrl: linkedinUrl,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiKey,
        },
      }
    );

    const person = response.data.data;

    logger.info({ linkedinUrl, email: person.emails?.[0]?.value }, 'LinkedIn enrichment completed');

    return {
      firstName: person.firstName,
      lastName: person.lastName,
      jobTitle: person.jobTitle,
      company: {
        name: person.company,
        domain: person.companyDomain,
      },
      email: person.emails?.[0]?.value || null,
      phone: person.phoneNumbers?.[0]?.value || null,
      location: {
        city: person.city,
        country: person.country,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Lusha LinkedIn enrichment failed');
      throw new Error(`Lusha LinkedIn enrichment failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const enrichFromLinkedInWithBreaker = createCircuitBreaker(enrichFromLinkedInInternal, {
  timeout: 15000,
  name: 'lusha-enrich-linkedin',
});

export const enrichFromLinkedIn = withRateLimit(
  (params: Parameters<typeof enrichFromLinkedInInternal>[0]) => enrichFromLinkedInWithBreaker.fire(params),
  lushaRateLimiter
);

/**
 * Get credit balance
 */
async function getCreditBalanceInternal(params: {
  apiKey?: string;
}): Promise<{
  balance: number;
  plan: string;
}> {
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info('Getting Lusha credit balance');

  try {
    const response = await axios.get(`${LUSHA_API_BASE}/balance`, {
      headers: {
        'api-token': apiKey,
      },
    });

    const balance = response.data.data;

    logger.info({ balance: balance.credits, plan: balance.planName }, 'Credit balance retrieved');

    return {
      balance: balance.credits,
      plan: balance.planName,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Lusha credit balance failed');
      throw new Error(`Lusha credit balance failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getCreditBalanceWithBreaker = createCircuitBreaker(getCreditBalanceInternal, {
  timeout: 10000,
  name: 'lusha-credit-balance',
});

export const getCreditBalance = withRateLimit(
  (params: Parameters<typeof getCreditBalanceInternal>[0]) => getCreditBalanceWithBreaker.fire(params),
  lushaRateLimiter
);

/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Clearbit Lead Enrichment Module
 *
 * Enrich leads with company and person data
 * Built with production-grade reliability:
 * - Circuit breaker to prevent hammering failing APIs
 * - Rate limiting (600 req/min for Clearbit API limits)
 * - Structured logging
 * - Automatic error handling
 *
 * Perfect for:
 * - Enriching person data from email
 * - Enriching company data from domain
 * - Revealing company from IP address
 * - Getting detailed firmographic data
 */

// Clearbit API rate limiter (600 req/min)
const clearbitRateLimiter = createRateLimiter({
  maxConcurrent: 20,
  minTime: 100, // 100ms between requests = ~600/min
  reservoir: 600,
  reservoirRefreshAmount: 600,
  reservoirRefreshInterval: 60 * 1000,
  id: 'clearbit-api',
});

const CLEARBIT_API_BASE = 'https://person.clearbit.com/v2';
const CLEARBIT_COMPANY_API = 'https://company.clearbit.com/v2';
const CLEARBIT_REVEAL_API = 'https://reveal.clearbit.com/v1';

interface ClearbitConfig {
  apiKey: string;
}

function getApiKey(config?: ClearbitConfig): string {
  const apiKey = config?.apiKey || process.env.CLEARBIT_API_KEY;
  if (!apiKey) {
    throw new Error('Clearbit API key is required. Set CLEARBIT_API_KEY env var or pass apiKey in config.');
  }
  return apiKey;
}

/**
 * Enrich person data from email address
 */
async function enrichPersonInternal(params: {
  email: string;
  webhookUrl?: string;
  subscribe?: boolean;
  apiKey?: string;
}): Promise<{
  id: string;
  name: {
    fullName: string;
    givenName: string;
    familyName: string;
  };
  email: string;
  location: string;
  bio: string;
  avatar: string;
  employment: {
    domain: string;
    name: string;
    title: string;
    role: string;
    seniority: string;
  };
  linkedin: {
    handle: string | null;
  };
  twitter: {
    handle: string | null;
    followers: number | null;
  };
  github: {
    handle: string | null;
    followers: number | null;
  };
}> {
  const { email, webhookUrl, subscribe } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ email }, 'Enriching person with Clearbit');

  try {
    const response = await axios.get(`${CLEARBIT_API_BASE}/people/find`, {
      params: {
        email,
        webhook_url: webhookUrl,
        subscribe,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const person = response.data;

    logger.info({ email, personId: person.id }, 'Person enriched successfully');

    return {
      id: person.id,
      name: {
        fullName: person.name?.fullName,
        givenName: person.name?.givenName,
        familyName: person.name?.familyName,
      },
      email: person.email,
      location: person.location,
      bio: person.bio,
      avatar: person.avatar,
      employment: {
        domain: person.employment?.domain,
        name: person.employment?.name,
        title: person.employment?.title,
        role: person.employment?.role,
        seniority: person.employment?.seniority,
      },
      linkedin: {
        handle: person.linkedin?.handle,
      },
      twitter: {
        handle: person.twitter?.handle,
        followers: person.twitter?.followers,
      },
      github: {
        handle: person.github?.handle,
        followers: person.github?.followers,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Clearbit returns 202 for async enrichment
      if (error.response?.status === 202) {
        logger.info({ email }, 'Person enrichment queued (async)');
        throw new Error('Person enrichment queued. Use webhook to receive results.');
      }

      logger.error({ status: error.response?.status, message: error.message }, 'Clearbit person enrichment failed');
      throw new Error(`Clearbit person enrichment failed: ${error.response?.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

const enrichPersonWithBreaker = createCircuitBreaker(enrichPersonInternal, {
  timeout: 15000,
  name: 'clearbit-enrich-person',
});

export const enrichPerson = withRateLimit(
  (params: Parameters<typeof enrichPersonInternal>[0]) => enrichPersonWithBreaker.fire(params),
  clearbitRateLimiter
);

/**
 * Enrich company data from domain
 */
async function enrichCompanyInternal(params: {
  domain: string;
  webhookUrl?: string;
  apiKey?: string;
}): Promise<{
  id: string;
  name: string;
  domain: string;
  category: {
    sector: string;
    industryGroup: string;
    industry: string;
    subIndustry: string;
  };
  description: string;
  foundedYear: number;
  location: string;
  tags: string[];
  metrics: {
    employees: number;
    employeesRange: string;
    annualRevenue: number | null;
    marketCap: number | null;
    raised: number | null;
  };
  linkedin: {
    handle: string | null;
  };
  twitter: {
    handle: string | null;
    followers: number | null;
  };
  facebook: {
    handle: string | null;
  };
  logo: string;
  tech: string[];
}> {
  const { domain, webhookUrl } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ domain }, 'Enriching company with Clearbit');

  try {
    const response = await axios.get(`${CLEARBIT_COMPANY_API}/companies/find`, {
      params: {
        domain,
        webhook_url: webhookUrl,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const company = response.data;

    logger.info({ domain, companyId: company.id }, 'Company enriched successfully');

    return {
      id: company.id,
      name: company.name,
      domain: company.domain,
      category: {
        sector: company.category?.sector,
        industryGroup: company.category?.industryGroup,
        industry: company.category?.industry,
        subIndustry: company.category?.subIndustry,
      },
      description: company.description,
      foundedYear: company.foundedYear,
      location: company.location,
      tags: company.tags || [],
      metrics: {
        employees: company.metrics?.employees,
        employeesRange: company.metrics?.employeesRange,
        annualRevenue: company.metrics?.annualRevenue,
        marketCap: company.metrics?.marketCap,
        raised: company.metrics?.raised,
      },
      linkedin: {
        handle: company.linkedin?.handle,
      },
      twitter: {
        handle: company.twitter?.handle,
        followers: company.twitter?.followers,
      },
      facebook: {
        handle: company.facebook?.handle,
      },
      logo: company.logo,
      tech: company.tech || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Clearbit returns 202 for async enrichment
      if (error.response?.status === 202) {
        logger.info({ domain }, 'Company enrichment queued (async)');
        throw new Error('Company enrichment queued. Use webhook to receive results.');
      }

      logger.error({ status: error.response?.status, message: error.message }, 'Clearbit company enrichment failed');
      throw new Error(`Clearbit company enrichment failed: ${error.response?.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

const enrichCompanyWithBreaker = createCircuitBreaker(enrichCompanyInternal, {
  timeout: 15000,
  name: 'clearbit-enrich-company',
});

export const enrichCompany = withRateLimit(
  (params: Parameters<typeof enrichCompanyInternal>[0]) => enrichCompanyWithBreaker.fire(params),
  clearbitRateLimiter
);

/**
 * Reveal company from IP address
 */
async function revealCompanyInternal(params: {
  ip: string;
  apiKey?: string;
}): Promise<{
  ip: string;
  fuzzy: boolean;
  company: {
    name: string;
    domain: string;
    category: {
      sector: string;
      industryGroup: string;
      industry: string;
    };
    description: string;
    employees: number;
    location: string;
    linkedin: {
      handle: string | null;
    };
    twitter: {
      handle: string | null;
    };
    logo: string;
    tags: string[];
    tech: string[];
  };
  geoIP: {
    city: string;
    state: string;
    stateCode: string;
    country: string;
    countryCode: string;
  };
}> {
  const { ip } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ ip }, 'Revealing company from IP with Clearbit');

  try {
    const response = await axios.get(`${CLEARBIT_REVEAL_API}/companies/find`, {
      params: {
        ip,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = response.data;

    logger.info({ ip, companyName: data.company?.name }, 'Company revealed from IP');

    return {
      ip: data.ip,
      fuzzy: data.fuzzy,
      company: {
        name: data.company?.name,
        domain: data.company?.domain,
        category: {
          sector: data.company?.category?.sector,
          industryGroup: data.company?.category?.industryGroup,
          industry: data.company?.category?.industry,
        },
        description: data.company?.description,
        employees: data.company?.metrics?.employees,
        location: data.company?.location,
        linkedin: {
          handle: data.company?.linkedin?.handle,
        },
        twitter: {
          handle: data.company?.twitter?.handle,
        },
        logo: data.company?.logo,
        tags: data.company?.tags || [],
        tech: data.company?.tech || [],
      },
      geoIP: {
        city: data.geoIP?.city,
        state: data.geoIP?.state,
        stateCode: data.geoIP?.stateCode,
        country: data.geoIP?.country,
        countryCode: data.geoIP?.countryCode,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Clearbit company reveal failed');
      throw new Error(`Clearbit company reveal failed: ${error.response?.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

const revealCompanyWithBreaker = createCircuitBreaker(revealCompanyInternal, {
  timeout: 15000,
  name: 'clearbit-reveal-company',
});

export const revealCompany = withRateLimit(
  (params: Parameters<typeof revealCompanyInternal>[0]) => revealCompanyWithBreaker.fire(params),
  clearbitRateLimiter
);

/**
 * Get combined enrichment (person + company)
 */
async function getCombinedEnrichmentInternal(params: {
  email: string;
  apiKey?: string;
}): Promise<{
  person: {
    id: string;
    name: {
      fullName: string;
      givenName: string;
      familyName: string;
    };
    email: string;
    title: string;
    role: string;
    seniority: string;
    linkedin: string | null;
    twitter: string | null;
  };
  company: {
    id: string;
    name: string;
    domain: string;
    industry: string;
    employees: number;
    revenue: number | null;
    description: string;
    logo: string;
    linkedin: string | null;
    twitter: string | null;
  };
}> {
  const { email } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ email }, 'Getting combined enrichment with Clearbit');

  try {
    const response = await axios.get(`${CLEARBIT_API_BASE}/combined/find`, {
      params: {
        email,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const { person, company } = response.data;

    logger.info({ email, personId: person?.id, companyId: company?.id }, 'Combined enrichment completed');

    return {
      person: {
        id: person.id,
        name: {
          fullName: person.name?.fullName,
          givenName: person.name?.givenName,
          familyName: person.name?.familyName,
        },
        email: person.email,
        title: person.employment?.title,
        role: person.employment?.role,
        seniority: person.employment?.seniority,
        linkedin: person.linkedin?.handle,
        twitter: person.twitter?.handle,
      },
      company: {
        id: company.id,
        name: company.name,
        domain: company.domain,
        industry: company.category?.industry,
        employees: company.metrics?.employees,
        revenue: company.metrics?.annualRevenue,
        description: company.description,
        logo: company.logo,
        linkedin: company.linkedin?.handle,
        twitter: company.twitter?.handle,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Clearbit combined enrichment failed');
      throw new Error(`Clearbit combined enrichment failed: ${error.response?.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

const getCombinedEnrichmentWithBreaker = createCircuitBreaker(getCombinedEnrichmentInternal, {
  timeout: 15000,
  name: 'clearbit-combined-enrichment',
});

export const getCombinedEnrichment = withRateLimit(
  (params: Parameters<typeof getCombinedEnrichmentInternal>[0]) => getCombinedEnrichmentWithBreaker.fire(params),
  clearbitRateLimiter
);

/**
 * Autocomplete company name from partial input
 */
async function autocompleteCompanyInternal(params: {
  query: string;
  apiKey?: string;
}): Promise<Array<{
  name: string;
  domain: string;
  logo: string;
}>> {
  const { query } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ query }, 'Autocompleting company with Clearbit');

  try {
    const response = await axios.get(`${CLEARBIT_COMPANY_API}/companies/suggest`, {
      params: {
        query,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    logger.info({ query, resultsCount: response.data.length }, 'Company autocomplete completed');

    return response.data.map((company: Record<string, unknown>) => ({
      name: company.name,
      domain: company.domain,
      logo: company.logo,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Clearbit autocomplete failed');
      throw new Error(`Clearbit autocomplete failed: ${error.response?.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

const autocompleteCompanyWithBreaker = createCircuitBreaker(autocompleteCompanyInternal, {
  timeout: 10000,
  name: 'clearbit-autocomplete',
});

export const autocompleteCompany = withRateLimit(
  (params: Parameters<typeof autocompleteCompanyInternal>[0]) => autocompleteCompanyWithBreaker.fire(params),
  clearbitRateLimiter
);

/**
 * Get person by name and company domain
 */
async function findPersonByNameInternal(params: {
  name: string;
  domain: string;
  apiKey?: string;
}): Promise<{
  id: string;
  name: {
    fullName: string;
    givenName: string;
    familyName: string;
  };
  email: string;
  title: string;
  role: string;
  linkedin: string | null;
  twitter: string | null;
}> {
  const { name, domain } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ name, domain }, 'Finding person by name with Clearbit');

  try {
    const response = await axios.get(`${CLEARBIT_API_BASE}/people/find`, {
      params: {
        name,
        domain,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const person = response.data;

    logger.info({ name, domain, personId: person.id }, 'Person found by name');

    return {
      id: person.id,
      name: {
        fullName: person.name?.fullName,
        givenName: person.name?.givenName,
        familyName: person.name?.familyName,
      },
      email: person.email,
      title: person.employment?.title,
      role: person.employment?.role,
      linkedin: person.linkedin?.handle,
      twitter: person.twitter?.handle,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Clearbit find person by name failed');
      throw new Error(`Clearbit find person by name failed: ${error.response?.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

const findPersonByNameWithBreaker = createCircuitBreaker(findPersonByNameInternal, {
  timeout: 15000,
  name: 'clearbit-find-person-by-name',
});

export const findPersonByName = withRateLimit(
  (params: Parameters<typeof findPersonByNameInternal>[0]) => findPersonByNameWithBreaker.fire(params),
  clearbitRateLimiter
);

/**
 * Get logo URL for a domain
 */
export async function getCompanyLogo(domain: string): Promise<string> {
  logger.info({ domain }, 'Getting company logo URL');

  // Clearbit provides free logo API without authentication
  const logoUrl = `https://logo.clearbit.com/${domain}`;

  logger.info({ domain, logoUrl }, 'Company logo URL generated');

  return logoUrl;
}

/**
 * Validate domain format
 */
export async function validateDomain(domain: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  logger.info({ domain }, 'Validating domain format');

  // Basic domain validation
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;

  if (!domainRegex.test(domain)) {
    return {
      valid: false,
      error: 'Invalid domain format',
    };
  }

  if (domain.length > 253) {
    return {
      valid: false,
      error: 'Domain too long (max 253 characters)',
    };
  }

  logger.info({ domain, valid: true }, 'Domain format validated');

  return {
    valid: true,
  };
}

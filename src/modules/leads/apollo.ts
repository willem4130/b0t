/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Apollo.io Lead Database Module
 *
 * B2B database for searching and enriching leads
 * Built with production-grade reliability:
 * - Circuit breaker to prevent hammering failing APIs
 * - Rate limiting (120 req/min for Apollo API limits)
 * - Structured logging
 * - Automatic error handling
 *
 * Perfect for:
 * - Searching for people and companies
 * - Enriching contact information
 * - Building targeted prospect lists
 * - Finding decision makers
 */

// Apollo API rate limiter (120 req/min)
const apolloRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 500, // 500ms between requests = ~120/min
  reservoir: 120,
  reservoirRefreshAmount: 120,
  reservoirRefreshInterval: 60 * 1000,
  id: 'apollo-api',
});

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

interface ApolloConfig {
  apiKey: string;
}

function getApiKey(config?: ApolloConfig): string {
  const apiKey = config?.apiKey || process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('Apollo API key is required. Set APOLLO_API_KEY env var or pass apiKey in config.');
  }
  return apiKey;
}

/**
 * Search for people in Apollo database
 */
async function searchPeopleInternal(params: {
  personTitles?: string[];
  companyDomains?: string[];
  companyNames?: string[];
  personLocations?: string[];
  personSeniorities?: string[];
  companyLocations?: string[];
  employeeRange?: string;
  revenue?: string;
  page?: number;
  perPage?: number;
  apiKey?: string;
}): Promise<{
  people: Array<{
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    title: string;
    email: string | null;
    organization: {
      name: string;
      domain: string;
      industry: string;
    };
    linkedin: string | null;
    city: string;
    state: string;
    country: string;
  }>;
  pagination: {
    page: number;
    perPage: number;
    totalEntries: number;
    totalPages: number;
  };
}> {
  const { page = 1, perPage = 10 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ page, perPage }, 'Searching people with Apollo');

  try {
    const response = await axios.post(
      `${APOLLO_API_BASE}/mixed_people/search`,
      {
        person_titles: params.personTitles,
        q_organization_domains: params.companyDomains,
        organization_names: params.companyNames,
        person_locations: params.personLocations,
        person_seniorities: params.personSeniorities,
        organization_locations: params.companyLocations,
        organization_num_employees_ranges: params.employeeRange ? [params.employeeRange] : undefined,
        revenue_range: params.revenue ? { min: params.revenue } : undefined,
        page,
        per_page: perPage,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
      }
    );

    const { people, pagination } = response.data;

    logger.info({ peopleCount: people.length, total: pagination.total_entries }, 'People search completed');

    return {
      people: people.map((person: Record<string, unknown>) => ({
        id: person.id,
        firstName: person.first_name,
        lastName: person.last_name,
        name: person.name,
        title: person.title,
        email: person.email,
        organization: {
          name: person.organization?.name,
          domain: person.organization?.primary_domain,
          industry: person.organization?.industry,
        },
        linkedin: person.linkedin_url,
        city: person.city,
        state: person.state,
        country: person.country,
      })),
      pagination: {
        page: pagination.page,
        perPage: pagination.per_page,
        totalEntries: pagination.total_entries,
        totalPages: pagination.total_pages,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Apollo people search failed');
      throw new Error(`Apollo people search failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

const searchPeopleWithBreaker = createCircuitBreaker(searchPeopleInternal, {
  timeout: 20000,
  name: 'apollo-search-people',
});

export const searchPeople = withRateLimit(
  (params: Parameters<typeof searchPeopleInternal>[0]) => searchPeopleWithBreaker.fire(params),
  apolloRateLimiter
);

/**
 * Enrich contact information for a person
 */
async function enrichContactInternal(params: {
  email?: string;
  firstName?: string;
  lastName?: string;
  domain?: string;
  apiKey?: string;
}): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  title: string;
  email: string;
  emailStatus: string;
  organization: {
    name: string;
    domain: string;
    industry: string;
    employeeCount: number;
    revenue: number | null;
  };
  linkedin: string | null;
  twitter: string | null;
  phoneNumbers: Array<{
    number: string;
    type: string;
  }>;
  city: string;
  state: string;
  country: string;
}> {
  const { email, firstName, lastName, domain } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  if (!email && !(firstName && lastName && domain)) {
    throw new Error('Either email or (firstName + lastName + domain) is required');
  }

  logger.info({ email, firstName, lastName, domain }, 'Enriching contact with Apollo');

  try {
    const response = await axios.post(
      `${APOLLO_API_BASE}/people/match`,
      {
        email,
        first_name: firstName,
        last_name: lastName,
        domain,
        reveal_personal_emails: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
      }
    );

    const { person } = response.data;

    logger.info({ personId: person.id, email: person.email }, 'Contact enriched successfully');

    return {
      id: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      name: person.name,
      title: person.title,
      email: person.email,
      emailStatus: person.email_status,
      organization: {
        name: person.organization?.name,
        domain: person.organization?.primary_domain,
        industry: person.organization?.industry,
        employeeCount: person.organization?.estimated_num_employees,
        revenue: person.organization?.annual_revenue,
      },
      linkedin: person.linkedin_url,
      twitter: person.twitter_url,
      phoneNumbers: person.phone_numbers || [],
      city: person.city,
      state: person.state,
      country: person.country,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Apollo contact enrichment failed');
      throw new Error(`Apollo contact enrichment failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

const enrichContactWithBreaker = createCircuitBreaker(enrichContactInternal, {
  timeout: 15000,
  name: 'apollo-enrich-contact',
});

export const enrichContact = withRateLimit(
  (params: Parameters<typeof enrichContactInternal>[0]) => enrichContactWithBreaker.fire(params),
  apolloRateLimiter
);

/**
 * Get company information
 */
async function getCompanyInfoInternal(params: {
  domain: string;
  apiKey?: string;
}): Promise<{
  id: string;
  name: string;
  domain: string;
  industry: string;
  employeeCount: number;
  revenue: number | null;
  founded: number | null;
  description: string;
  linkedin: string | null;
  twitter: string | null;
  facebook: string | null;
  phone: string | null;
  headquarters: {
    city: string;
    state: string;
    country: string;
    address: string;
  };
  technologies: string[];
}> {
  const { domain } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ domain }, 'Getting company info with Apollo');

  try {
    const response = await axios.get(`${APOLLO_API_BASE}/organizations/enrich`, {
      params: {
        domain,
        api_key: apiKey,
      },
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    const { organization } = response.data;

    logger.info({ companyId: organization.id, name: organization.name }, 'Company info retrieved');

    return {
      id: organization.id,
      name: organization.name,
      domain: organization.primary_domain,
      industry: organization.industry,
      employeeCount: organization.estimated_num_employees,
      revenue: organization.annual_revenue,
      founded: organization.founded_year,
      description: organization.short_description,
      linkedin: organization.linkedin_url,
      twitter: organization.twitter_url,
      facebook: organization.facebook_url,
      phone: organization.phone,
      headquarters: {
        city: organization.city,
        state: organization.state,
        country: organization.country,
        address: organization.street_address,
      },
      technologies: organization.technologies || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Apollo company info failed');
      throw new Error(`Apollo company info failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

const getCompanyInfoWithBreaker = createCircuitBreaker(getCompanyInfoInternal, {
  timeout: 15000,
  name: 'apollo-company-info',
});

export const getCompanyInfo = withRateLimit(
  (params: Parameters<typeof getCompanyInfoInternal>[0]) => getCompanyInfoWithBreaker.fire(params),
  apolloRateLimiter
);

/**
 * Create a contact in Apollo
 */
async function createContactInternal(params: {
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  companyName?: string;
  linkedinUrl?: string;
  apiKey?: string;
}): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  title: string | null;
}> {
  const { firstName, lastName, email, title, companyName, linkedinUrl } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ firstName, lastName, email }, 'Creating contact in Apollo');

  try {
    const response = await axios.post(
      `${APOLLO_API_BASE}/contacts`,
      {
        first_name: firstName,
        last_name: lastName,
        email,
        title,
        organization_name: companyName,
        linkedin_url: linkedinUrl,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
      }
    );

    const { contact } = response.data;

    logger.info({ contactId: contact.id }, 'Contact created successfully');

    return {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      title: contact.title,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Apollo contact creation failed');
      throw new Error(`Apollo contact creation failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

const createContactWithBreaker = createCircuitBreaker(createContactInternal, {
  timeout: 15000,
  name: 'apollo-create-contact',
});

export const createContact = withRateLimit(
  (params: Parameters<typeof createContactInternal>[0]) => createContactWithBreaker.fire(params),
  apolloRateLimiter
);

/**
 * Search for companies in Apollo database
 */
async function searchCompaniesInternal(params: {
  organizationNames?: string[];
  domains?: string[];
  industries?: string[];
  locations?: string[];
  employeeRange?: string;
  revenue?: string;
  technologies?: string[];
  page?: number;
  perPage?: number;
  apiKey?: string;
}): Promise<{
  companies: Array<{
    id: string;
    name: string;
    domain: string;
    industry: string;
    employeeCount: number;
    revenue: number | null;
    linkedin: string | null;
    city: string;
    state: string;
    country: string;
  }>;
  pagination: {
    page: number;
    perPage: number;
    totalEntries: number;
    totalPages: number;
  };
}> {
  const { page = 1, perPage = 10 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ page, perPage }, 'Searching companies with Apollo');

  try {
    const response = await axios.post(
      `${APOLLO_API_BASE}/mixed_companies/search`,
      {
        organization_names: params.organizationNames,
        q_organization_domains: params.domains,
        organization_industry_tag_ids: params.industries,
        organization_locations: params.locations,
        organization_num_employees_ranges: params.employeeRange ? [params.employeeRange] : undefined,
        revenue_range: params.revenue ? { min: params.revenue } : undefined,
        technologies: params.technologies,
        page,
        per_page: perPage,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
      }
    );

    const { accounts, pagination } = response.data;

    logger.info({ companiesCount: accounts.length, total: pagination.total_entries }, 'Company search completed');

    return {
      companies: accounts.map((company: Record<string, unknown>) => ({
        id: company.id,
        name: company.name,
        domain: company.primary_domain,
        industry: company.industry,
        employeeCount: company.estimated_num_employees,
        revenue: company.annual_revenue,
        linkedin: company.linkedin_url,
        city: company.city,
        state: company.state,
        country: company.country,
      })),
      pagination: {
        page: pagination.page,
        perPage: pagination.per_page,
        totalEntries: pagination.total_entries,
        totalPages: pagination.total_pages,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Apollo company search failed');
      throw new Error(`Apollo company search failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

const searchCompaniesWithBreaker = createCircuitBreaker(searchCompaniesInternal, {
  timeout: 20000,
  name: 'apollo-search-companies',
});

export const searchCompanies = withRateLimit(
  (params: Parameters<typeof searchCompaniesInternal>[0]) => searchCompaniesWithBreaker.fire(params),
  apolloRateLimiter
);

/**
 * Get email for a person (reveal email)
 */
async function getEmailInternal(params: {
  personId: string;
  apiKey?: string;
}): Promise<{
  email: string;
  emailStatus: string;
  firstName: string;
  lastName: string;
}> {
  const { personId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ personId }, 'Revealing email with Apollo');

  try {
    const response = await axios.get(`${APOLLO_API_BASE}/people/${personId}`, {
      params: {
        api_key: apiKey,
        reveal_personal_emails: true,
      },
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    const { person } = response.data;

    logger.info({ personId, email: person.email }, 'Email revealed successfully');

    return {
      email: person.email,
      emailStatus: person.email_status,
      firstName: person.first_name,
      lastName: person.last_name,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Apollo email reveal failed');
      throw new Error(`Apollo email reveal failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

const getEmailWithBreaker = createCircuitBreaker(getEmailInternal, {
  timeout: 15000,
  name: 'apollo-get-email',
});

export const getEmail = withRateLimit(
  (params: Parameters<typeof getEmailInternal>[0]) => getEmailWithBreaker.fire(params),
  apolloRateLimiter
);

/**
 * Get job postings for a company
 */
async function getJobPostingsInternal(params: {
  organizationId: string;
  apiKey?: string;
}): Promise<Array<{
  id: string;
  title: string;
  location: string;
  department: string | null;
  url: string;
  postedDate: string;
}>> {
  const { organizationId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ organizationId }, 'Getting job postings with Apollo');

  try {
    const response = await axios.get(`${APOLLO_API_BASE}/organizations/${organizationId}/job_postings`, {
      params: {
        api_key: apiKey,
      },
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    const { job_postings } = response.data;

    logger.info({ organizationId, jobCount: job_postings.length }, 'Job postings retrieved');

    return job_postings.map((job: Record<string, unknown>) => ({
      id: job.id,
      title: job.title,
      location: job.location,
      department: job.department,
      url: job.url,
      postedDate: job.posted_at,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Apollo job postings failed');
      throw new Error(`Apollo job postings failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

const getJobPostingsWithBreaker = createCircuitBreaker(getJobPostingsInternal, {
  timeout: 15000,
  name: 'apollo-job-postings',
});

export const getJobPostings = withRateLimit(
  (params: Parameters<typeof getJobPostingsInternal>[0]) => getJobPostingsWithBreaker.fire(params),
  apolloRateLimiter
);

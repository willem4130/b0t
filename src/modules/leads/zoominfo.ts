/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * ZoomInfo B2B Database Module
 *
 * Access comprehensive B2B contact and company database
 * Built with production-grade reliability:
 * - Circuit breaker to prevent hammering failing APIs
 * - Rate limiting (100 req/min for ZoomInfo API limits)
 * - Structured logging
 * - Automatic error handling
 *
 * Perfect for:
 * - Searching for B2B contacts
 * - Enriching company information
 * - Getting technographics data
 * - Finding decision makers
 */

// ZoomInfo API rate limiter (100 req/min)
const zoominfoRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 600, // 600ms between requests = ~100/min
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000,
  id: 'zoominfo-api',
});

const ZOOMINFO_API_BASE = 'https://api.zoominfo.com';

interface ZoomInfoConfig {
  apiKey: string;
}

function getApiKey(config?: ZoomInfoConfig): string {
  const apiKey = config?.apiKey || process.env.ZOOMINFO_API_KEY;
  if (!apiKey) {
    throw new Error('ZoomInfo API key is required. Set ZOOMINFO_API_KEY env var or pass apiKey in config.');
  }
  return apiKey;
}

/**
 * Search for contacts in ZoomInfo database
 */
async function searchContactsInternal(params: {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  employeeSize?: string;
  revenue?: string;
  page?: number;
  pageSize?: number;
  apiKey?: string;
}): Promise<{
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    jobTitle: string;
    department: string;
    seniority: string;
    company: {
      id: string;
      name: string;
      domain: string;
      industry: string;
      employeeCount: number;
      revenue: number | null;
    };
    location: {
      city: string;
      state: string;
      country: string;
    };
    linkedin: string | null;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  };
}> {
  const { page = 1, pageSize = 10 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ page, pageSize }, 'Searching contacts with ZoomInfo');

  try {
    const response = await axios.post(
      `${ZOOMINFO_API_BASE}/search/contact`,
      {
        firstName: params.firstName,
        lastName: params.lastName,
        companyName: params.companyName,
        jobTitle: params.jobTitle,
        location: params.location,
        industry: params.industry,
        employeeSize: params.employeeSize,
        revenueRange: params.revenue,
        page,
        rpp: pageSize,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const { data } = response.data;

    logger.info({ contactCount: data?.length || 0 }, 'Contact search completed');

    return {
      contacts: (data || []).map((contact: Record<string, unknown>) => ({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        jobTitle: contact.jobTitle,
        department: contact.department,
        seniority: contact.managementLevel,
        company: {
          id: contact.companyId,
          name: contact.companyName,
          domain: contact.companyWebsite,
          industry: contact.companyIndustry,
          employeeCount: contact.companyEmployeeCount,
          revenue: contact.companyRevenue,
        },
        location: {
          city: contact.city,
          state: contact.state,
          country: contact.country,
        },
        linkedin: contact.linkedInUrl,
      })),
      pagination: {
        page: response.data.currentPage || page,
        pageSize: response.data.resultsPerPage || pageSize,
        totalResults: response.data.totalResults || 0,
        totalPages: response.data.totalPages || 0,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'ZoomInfo contact search failed');
      throw new Error(`ZoomInfo contact search failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const searchContactsWithBreaker = createCircuitBreaker(searchContactsInternal, {
  timeout: 20000,
  name: 'zoominfo-search-contacts',
});

export const searchContacts = withRateLimit(
  (params: Parameters<typeof searchContactsInternal>[0]) => searchContactsWithBreaker.fire(params),
  zoominfoRateLimiter
);

/**
 * Enrich company information
 */
async function enrichCompanyInternal(params: {
  domain?: string;
  companyName?: string;
  apiKey?: string;
}): Promise<{
  id: string;
  name: string;
  domain: string;
  description: string;
  industry: string;
  subIndustry: string;
  employeeCount: number;
  revenue: number;
  yearFounded: number;
  headquarters: {
    address: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  phone: string;
  linkedin: string | null;
  twitter: string | null;
  facebook: string | null;
  parentCompany: string | null;
  ticker: string | null;
}> {
  const { domain, companyName } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  if (!domain && !companyName) {
    throw new Error('Either domain or companyName is required');
  }

  logger.info({ domain, companyName }, 'Enriching company with ZoomInfo');

  try {
    const response = await axios.post(
      `${ZOOMINFO_API_BASE}/enrich/company`,
      {
        match: {
          website: domain,
          companyName,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const company = response.data.data;

    logger.info({ companyId: company.id, name: company.name }, 'Company enriched successfully');

    return {
      id: company.id,
      name: company.name,
      domain: company.website,
      description: company.description,
      industry: company.industry,
      subIndustry: company.subIndustry,
      employeeCount: company.employeeCount,
      revenue: company.revenue,
      yearFounded: company.foundedYear,
      headquarters: {
        address: company.street,
        city: company.city,
        state: company.state,
        country: company.country,
        zipCode: company.zipCode,
      },
      phone: company.phone,
      linkedin: company.linkedInUrl,
      twitter: company.twitterUrl,
      facebook: company.facebookUrl,
      parentCompany: company.parentCompany,
      ticker: company.ticker,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'ZoomInfo company enrichment failed');
      throw new Error(`ZoomInfo company enrichment failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const enrichCompanyWithBreaker = createCircuitBreaker(enrichCompanyInternal, {
  timeout: 15000,
  name: 'zoominfo-enrich-company',
});

export const enrichCompany = withRateLimit(
  (params: Parameters<typeof enrichCompanyInternal>[0]) => enrichCompanyWithBreaker.fire(params),
  zoominfoRateLimiter
);

/**
 * Get technographics (technology stack) for a company
 */
async function getTechnographicsInternal(params: {
  companyId: string;
  apiKey?: string;
}): Promise<{
  companyId: string;
  technologies: Array<{
    name: string;
    category: string;
    vendor: string;
    status: string;
    installDate: string | null;
  }>;
}> {
  const { companyId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ companyId }, 'Getting technographics with ZoomInfo');

  try {
    const response = await axios.get(`${ZOOMINFO_API_BASE}/company/${companyId}/technologies`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const technologies = response.data.data;

    logger.info({ companyId, techCount: technologies?.length || 0 }, 'Technographics retrieved');

    return {
      companyId,
      technologies: (technologies || []).map((tech: Record<string, unknown>) => ({
        name: tech.name,
        category: tech.category,
        vendor: tech.vendor,
        status: tech.status,
        installDate: tech.installDate,
      })),
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'ZoomInfo technographics failed');
      throw new Error(`ZoomInfo technographics failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getTechnographicsWithBreaker = createCircuitBreaker(getTechnographicsInternal, {
  timeout: 15000,
  name: 'zoominfo-technographics',
});

export const getTechnographics = withRateLimit(
  (params: Parameters<typeof getTechnographicsInternal>[0]) => getTechnographicsWithBreaker.fire(params),
  zoominfoRateLimiter
);

/**
 * Get contact details by ID
 */
async function getContactDetailsInternal(params: {
  contactId: string;
  apiKey?: string;
}): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  directPhone: string | null;
  mobilePhone: string | null;
  jobTitle: string;
  department: string;
  seniority: string;
  company: {
    id: string;
    name: string;
    domain: string;
  };
  location: {
    city: string;
    state: string;
    country: string;
  };
  linkedin: string | null;
  twitter: string | null;
  educationHistory: Array<{
    school: string;
    degree: string;
    major: string;
    graduationYear: number;
  }>;
  employmentHistory: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string | null;
  }>;
}> {
  const { contactId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ contactId }, 'Getting contact details with ZoomInfo');

  try {
    const response = await axios.get(`${ZOOMINFO_API_BASE}/contact/${contactId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const contact = response.data.data;

    logger.info({ contactId, email: contact.email }, 'Contact details retrieved');

    return {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      directPhone: contact.directPhoneNumber,
      mobilePhone: contact.mobilePhoneNumber,
      jobTitle: contact.jobTitle,
      department: contact.department,
      seniority: contact.managementLevel,
      company: {
        id: contact.companyId,
        name: contact.companyName,
        domain: contact.companyWebsite,
      },
      location: {
        city: contact.city,
        state: contact.state,
        country: contact.country,
      },
      linkedin: contact.linkedInUrl,
      twitter: contact.twitterUrl,
      educationHistory: contact.educationHistory || [],
      employmentHistory: contact.employmentHistory || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'ZoomInfo contact details failed');
      throw new Error(`ZoomInfo contact details failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getContactDetailsWithBreaker = createCircuitBreaker(getContactDetailsInternal, {
  timeout: 15000,
  name: 'zoominfo-contact-details',
});

export const getContactDetails = withRateLimit(
  (params: Parameters<typeof getContactDetailsInternal>[0]) => getContactDetailsWithBreaker.fire(params),
  zoominfoRateLimiter
);

/**
 * Search for companies
 */
async function searchCompaniesInternal(params: {
  companyName?: string;
  industry?: string;
  location?: string;
  employeeSize?: string;
  revenue?: string;
  technologies?: string[];
  page?: number;
  pageSize?: number;
  apiKey?: string;
}): Promise<{
  companies: Array<{
    id: string;
    name: string;
    domain: string;
    industry: string;
    employeeCount: number;
    revenue: number | null;
    location: {
      city: string;
      state: string;
      country: string;
    };
    linkedin: string | null;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  };
}> {
  const { page = 1, pageSize = 10 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ page, pageSize }, 'Searching companies with ZoomInfo');

  try {
    const response = await axios.post(
      `${ZOOMINFO_API_BASE}/search/company`,
      {
        companyName: params.companyName,
        industry: params.industry,
        location: params.location,
        employeeSize: params.employeeSize,
        revenueRange: params.revenue,
        technologies: params.technologies,
        page,
        rpp: pageSize,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const { data } = response.data;

    logger.info({ companyCount: data?.length || 0 }, 'Company search completed');

    return {
      companies: (data || []).map((company: Record<string, unknown>) => ({
        id: company.id,
        name: company.name,
        domain: company.website,
        industry: company.industry,
        employeeCount: company.employeeCount,
        revenue: company.revenue,
        location: {
          city: company.city,
          state: company.state,
          country: company.country,
        },
        linkedin: company.linkedInUrl,
      })),
      pagination: {
        page: response.data.currentPage || page,
        pageSize: response.data.resultsPerPage || pageSize,
        totalResults: response.data.totalResults || 0,
        totalPages: response.data.totalPages || 0,
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'ZoomInfo company search failed');
      throw new Error(`ZoomInfo company search failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const searchCompaniesWithBreaker = createCircuitBreaker(searchCompaniesInternal, {
  timeout: 20000,
  name: 'zoominfo-search-companies',
});

export const searchCompanies = withRateLimit(
  (params: Parameters<typeof searchCompaniesInternal>[0]) => searchCompaniesWithBreaker.fire(params),
  zoominfoRateLimiter
);

/**
 * Get intent data (buying signals) for companies
 */
async function getIntentDataInternal(params: {
  companyId: string;
  apiKey?: string;
}): Promise<{
  companyId: string;
  intentTopics: Array<{
    topic: string;
    score: number;
    dateDetected: string;
    sources: string[];
  }>;
}> {
  const { companyId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ companyId }, 'Getting intent data with ZoomInfo');

  try {
    const response = await axios.get(`${ZOOMINFO_API_BASE}/company/${companyId}/intent`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const intentData = response.data.data;

    logger.info({ companyId, topicsCount: intentData?.length || 0 }, 'Intent data retrieved');

    return {
      companyId,
      intentTopics: (intentData || []).map((intent: Record<string, unknown>) => ({
        topic: intent.topic,
        score: intent.score,
        dateDetected: intent.dateDetected,
        sources: intent.sources || [],
      })),
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'ZoomInfo intent data failed');
      throw new Error(`ZoomInfo intent data failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getIntentDataWithBreaker = createCircuitBreaker(getIntentDataInternal, {
  timeout: 15000,
  name: 'zoominfo-intent-data',
});

export const getIntentData = withRateLimit(
  (params: Parameters<typeof getIntentDataInternal>[0]) => getIntentDataWithBreaker.fire(params),
  zoominfoRateLimiter
);

/**
 * Get scoops (company news and events)
 */
async function getScoopsInternal(params: {
  companyId: string;
  apiKey?: string;
}): Promise<Array<{
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  source: string | null;
}>> {
  const { companyId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ companyId }, 'Getting scoops with ZoomInfo');

  try {
    const response = await axios.get(`${ZOOMINFO_API_BASE}/company/${companyId}/scoops`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const scoops = response.data.data;

    logger.info({ companyId, scoopsCount: scoops?.length || 0 }, 'Scoops retrieved');

    return (scoops || []).map((scoop: Record<string, unknown>) => ({
      id: scoop.id,
      type: scoop.scoopType,
      title: scoop.title,
      description: scoop.description,
      date: scoop.date,
      source: scoop.source,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'ZoomInfo scoops failed');
      throw new Error(`ZoomInfo scoops failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getScoopsWithBreaker = createCircuitBreaker(getScoopsInternal, {
  timeout: 15000,
  name: 'zoominfo-scoops',
});

export const getScoops = withRateLimit(
  (params: Parameters<typeof getScoopsInternal>[0]) => getScoopsWithBreaker.fire(params),
  zoominfoRateLimiter
);

/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Proxycurl LinkedIn Scraper Module
 *
 * Scrape LinkedIn profiles, companies, and search data
 * Built with production-grade reliability:
 * - Circuit breaker to prevent hammering failing APIs
 * - Rate limiting (300 req/min for Proxycurl API limits)
 * - Structured logging
 * - Automatic error handling
 *
 * Perfect for:
 * - Scraping LinkedIn profile data
 * - Getting company information
 * - Searching for people
 * - Getting LinkedIn posts
 */

// Proxycurl API rate limiter (300 req/min)
const proxycurlRateLimiter = createRateLimiter({
  maxConcurrent: 20,
  minTime: 200, // 200ms between requests = ~300/min
  reservoir: 300,
  reservoirRefreshAmount: 300,
  reservoirRefreshInterval: 60 * 1000,
  id: 'proxycurl-api',
});

const PROXYCURL_API_BASE = 'https://nubela.co/proxycurl/api';

interface ProxycurlConfig {
  apiKey: string;
}

function getApiKey(config?: ProxycurlConfig): string {
  const apiKey = config?.apiKey || process.env.PROXYCURL_API_KEY;
  if (!apiKey) {
    throw new Error('Proxycurl API key is required. Set PROXYCURL_API_KEY env var or pass apiKey in config.');
  }
  return apiKey;
}

/**
 * Get LinkedIn profile data
 */
async function getProfileInternal(params: {
  linkedinUrl: string;
  useCache?: boolean;
  apiKey?: string;
}): Promise<{
  publicIdentifier: string;
  firstName: string;
  lastName: string;
  fullName: string;
  headline: string;
  summary: string;
  country: string;
  city: string;
  state: string;
  experiences: Array<{
    company: string;
    companyLinkedinUrl: string | null;
    title: string;
    description: string;
    location: string;
    startsAt: { day: number; month: number; year: number };
    endsAt: { day: number; month: number; year: number } | null;
  }>;
  education: Array<{
    school: string;
    degree: string;
    fieldOfStudy: string;
    startsAt: { day: number; month: number; year: number };
    endsAt: { day: number; month: number; year: number } | null;
  }>;
  skills: string[];
  connections: number | null;
  profilePicUrl: string;
}> {
  const { linkedinUrl, useCache = true } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ linkedinUrl }, 'Getting LinkedIn profile with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/v2/linkedin`, {
      params: {
        url: linkedinUrl,
        use_cache: useCache ? 'if-recent' : 'if-present',
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const profile = response.data;

    logger.info({ linkedinUrl, fullName: profile.full_name }, 'LinkedIn profile retrieved');

    return {
      publicIdentifier: profile.public_identifier,
      firstName: profile.first_name,
      lastName: profile.last_name,
      fullName: profile.full_name,
      headline: profile.headline,
      summary: profile.summary,
      country: profile.country,
      city: profile.city,
      state: profile.state,
      experiences: profile.experiences || [],
      education: profile.education || [],
      skills: profile.skills || [],
      connections: profile.connections,
      profilePicUrl: profile.profile_pic_url,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl profile retrieval failed');
      throw new Error(`Proxycurl profile retrieval failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getProfileWithBreaker = createCircuitBreaker(getProfileInternal, {
  timeout: 20000,
  name: 'proxycurl-get-profile',
});

export const getProfile = withRateLimit(
  (params: Parameters<typeof getProfileInternal>[0]) => getProfileWithBreaker.fire(params),
  proxycurlRateLimiter
);

/**
 * Get LinkedIn company data
 */
async function getCompanyInternal(params: {
  linkedinUrl: string;
  useCache?: boolean;
  apiKey?: string;
}): Promise<{
  name: string;
  description: string;
  website: string;
  industry: string;
  companySize: string;
  companyType: string;
  founded: number;
  specialties: string[];
  locations: Array<{
    city: string;
    state: string;
    country: string;
    isHq: boolean;
  }>;
  followersCount: number;
  logoUrl: string;
  updates: Array<{
    text: string;
    date: string;
    likes: number;
    comments: number;
  }>;
}> {
  const { linkedinUrl, useCache = true } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ linkedinUrl }, 'Getting LinkedIn company with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/linkedin/company`, {
      params: {
        url: linkedinUrl,
        use_cache: useCache ? 'if-recent' : 'if-present',
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const company = response.data;

    logger.info({ linkedinUrl, name: company.name }, 'LinkedIn company retrieved');

    return {
      name: company.name,
      description: company.description,
      website: company.website,
      industry: company.industry,
      companySize: company.company_size,
      companyType: company.company_type,
      founded: company.founded_year,
      specialties: company.specialties || [],
      locations: company.locations || [],
      followersCount: company.follower_count,
      logoUrl: company.logo_url,
      updates: company.updates || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl company retrieval failed');
      throw new Error(`Proxycurl company retrieval failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getCompanyWithBreaker = createCircuitBreaker(getCompanyInternal, {
  timeout: 20000,
  name: 'proxycurl-get-company',
});

export const getCompany = withRateLimit(
  (params: Parameters<typeof getCompanyInternal>[0]) => getCompanyWithBreaker.fire(params),
  proxycurlRateLimiter
);

/**
 * Search for people on LinkedIn
 */
async function searchPeopleInternal(params: {
  country?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  school?: string;
  page?: number;
  apiKey?: string;
}): Promise<{
  results: Array<{
    linkedinUrl: string;
    firstName: string;
    lastName: string;
    fullName: string;
    headline: string;
    location: string;
    profilePicUrl: string;
  }>;
  nextPage: number | null;
}> {
  const { page = 1 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ page }, 'Searching people on LinkedIn with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/search/person`, {
      params: {
        country: params.country,
        first_name: params.firstName,
        last_name: params.lastName,
        title: params.title,
        company: params.company,
        school: params.school,
        page,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const { results, next_page } = response.data;

    logger.info({ resultsCount: results?.length || 0 }, 'People search completed');

    return {
      results: (results || []).map((person: Record<string, unknown>) => ({
        linkedinUrl: person.linkedin_profile_url,
        firstName: person.first_name,
        lastName: person.last_name,
        fullName: person.name,
        headline: person.headline,
        location: person.location,
        profilePicUrl: person.profile_pic_url,
      })),
      nextPage: next_page,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl people search failed');
      throw new Error(`Proxycurl people search failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const searchPeopleWithBreaker = createCircuitBreaker(searchPeopleInternal, {
  timeout: 20000,
  name: 'proxycurl-search-people',
});

export const searchPeople = withRateLimit(
  (params: Parameters<typeof searchPeopleInternal>[0]) => searchPeopleWithBreaker.fire(params),
  proxycurlRateLimiter
);

/**
 * Get LinkedIn posts from a profile
 */
async function getPostsInternal(params: {
  linkedinUrl: string;
  start?: number;
  count?: number;
  apiKey?: string;
}): Promise<Array<{
  activityId: string;
  text: string;
  postedDate: string;
  likes: number;
  comments: number;
  shares: number;
  images: string[];
  videoUrl: string | null;
}>> {
  const { linkedinUrl, start = 0, count = 10 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ linkedinUrl, count }, 'Getting LinkedIn posts with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/linkedin/profile/posts`, {
      params: {
        url: linkedinUrl,
        start,
        count,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const posts = response.data.activities;

    logger.info({ linkedinUrl, postsCount: posts?.length || 0 }, 'LinkedIn posts retrieved');

    return (posts || []).map((post: Record<string, unknown>) => ({
      activityId: post.activity_id,
      text: post.text,
      postedDate: post.posted_date,
      likes: post.num_likes,
      comments: post.num_comments,
      shares: post.num_shares,
      images: post.images || [],
      videoUrl: post.video_url,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl posts retrieval failed');
      throw new Error(`Proxycurl posts retrieval failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getPostsWithBreaker = createCircuitBreaker(getPostsInternal, {
  timeout: 20000,
  name: 'proxycurl-get-posts',
});

export const getPosts = withRateLimit(
  (params: Parameters<typeof getPostsInternal>[0]) => getPostsWithBreaker.fire(params),
  proxycurlRateLimiter
);

/**
 * Get contact info (email/phone) from LinkedIn profile
 */
async function getContactInfoInternal(params: {
  linkedinUrl: string;
  apiKey?: string;
}): Promise<{
  emails: string[];
  phoneNumbers: string[];
}> {
  const { linkedinUrl } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ linkedinUrl }, 'Getting contact info with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/contact-api/personal-contact`, {
      params: {
        linkedin_profile_url: linkedinUrl,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const contact = response.data;

    logger.info({ linkedinUrl, emailCount: contact.emails?.length || 0 }, 'Contact info retrieved');

    return {
      emails: contact.emails || [],
      phoneNumbers: contact.phone_numbers || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl contact info failed');
      throw new Error(`Proxycurl contact info failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getContactInfoWithBreaker = createCircuitBreaker(getContactInfoInternal, {
  timeout: 15000,
  name: 'proxycurl-contact-info',
});

export const getContactInfo = withRateLimit(
  (params: Parameters<typeof getContactInfoInternal>[0]) => getContactInfoWithBreaker.fire(params),
  proxycurlRateLimiter
);

/**
 * Get company employees
 */
async function getCompanyEmployeesInternal(params: {
  linkedinUrl: string;
  page?: number;
  apiKey?: string;
}): Promise<{
  employees: Array<{
    linkedinUrl: string;
    firstName: string;
    lastName: string;
    title: string;
    location: string;
  }>;
  nextPage: number | null;
}> {
  const { linkedinUrl, page = 1 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ linkedinUrl, page }, 'Getting company employees with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/linkedin/company/employees`, {
      params: {
        url: linkedinUrl,
        page,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const { employees, next_page } = response.data;

    logger.info({ linkedinUrl, employeeCount: employees?.length || 0 }, 'Company employees retrieved');

    return {
      employees: (employees || []).map((emp: Record<string, unknown>) => ({
        linkedinUrl: emp.profile_url,
        firstName: emp.first_name,
        lastName: emp.last_name,
        title: emp.title,
        location: emp.location,
      })),
      nextPage: next_page,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl employees retrieval failed');
      throw new Error(`Proxycurl employees retrieval failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getCompanyEmployeesWithBreaker = createCircuitBreaker(getCompanyEmployeesInternal, {
  timeout: 20000,
  name: 'proxycurl-company-employees',
});

export const getCompanyEmployees = withRateLimit(
  (params: Parameters<typeof getCompanyEmployeesInternal>[0]) => getCompanyEmployeesWithBreaker.fire(params),
  proxycurlRateLimiter
);

/**
 * Resolve LinkedIn profile URL from email
 */
async function resolveProfileFromEmailInternal(params: {
  email: string;
  apiKey?: string;
}): Promise<{
  linkedinUrl: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
}> {
  const { email } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ email }, 'Resolving LinkedIn profile from email with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/linkedin/profile/resolve/email`, {
      params: {
        email,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const profile = response.data;

    logger.info({ email, linkedinUrl: profile.url }, 'LinkedIn profile resolved from email');

    return {
      linkedinUrl: profile.url,
      firstName: profile.first_name,
      lastName: profile.last_name,
      fullName: profile.name,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl email resolution failed');
      throw new Error(`Proxycurl email resolution failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const resolveProfileFromEmailWithBreaker = createCircuitBreaker(resolveProfileFromEmailInternal, {
  timeout: 15000,
  name: 'proxycurl-resolve-email',
});

export const resolveProfileFromEmail = withRateLimit(
  (params: Parameters<typeof resolveProfileFromEmailInternal>[0]) => resolveProfileFromEmailWithBreaker.fire(params),
  proxycurlRateLimiter
);

/**
 * Search for companies on LinkedIn
 */
async function searchCompaniesInternal(params: {
  name?: string;
  industry?: string;
  location?: string;
  employeeSize?: string;
  page?: number;
  apiKey?: string;
}): Promise<{
  companies: Array<{
    linkedinUrl: string;
    name: string;
    industry: string;
    location: string;
    size: string;
    logoUrl: string;
  }>;
  nextPage: number | null;
}> {
  const { page = 1 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ page }, 'Searching companies on LinkedIn with Proxycurl');

  try {
    const response = await axios.get(`${PROXYCURL_API_BASE}/search/company`, {
      params: {
        name: params.name,
        industry: params.industry,
        location: params.location,
        employee_count: params.employeeSize,
        page,
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const { results, next_page } = response.data;

    logger.info({ resultsCount: results?.length || 0 }, 'Company search completed');

    return {
      companies: (results || []).map((company: Record<string, unknown>) => ({
        linkedinUrl: company.linkedin_profile_url,
        name: company.name,
        industry: company.industry,
        location: company.location,
        size: company.company_size,
        logoUrl: company.logo_url,
      })),
      nextPage: next_page,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'Proxycurl company search failed');
      throw new Error(`Proxycurl company search failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const searchCompaniesWithBreaker = createCircuitBreaker(searchCompaniesInternal, {
  timeout: 20000,
  name: 'proxycurl-search-companies',
});

export const searchCompanies = withRateLimit(
  (params: Parameters<typeof searchCompaniesInternal>[0]) => searchCompaniesWithBreaker.fire(params),
  proxycurlRateLimiter
);

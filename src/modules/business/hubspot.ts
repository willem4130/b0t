import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * HubSpot CRM Module
 *
 * Manage contacts, deals, companies, and CRM operations
 * - Create/update contacts
 * - Create/update deals
 * - Create/update companies
 * - Search CRM objects
 * - Get contact/deal/company by ID
 * - Add notes and activities
 * - Built-in resilience
 *
 * Perfect for:
 * - Lead management automation
 * - Sales pipeline workflows
 * - Customer data synchronization
 * - Marketing automation
 */

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

if (!HUBSPOT_API_KEY) {
  logger.warn('⚠️  HUBSPOT_API_KEY not set. HubSpot features will not work.');
}

// Rate limiter: HubSpot allows 100 req/10sec for most endpoints
const hubspotRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // 100ms between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 10000,
  id: 'hubspot',
});

export interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    company?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    pipeline?: string;
    closedate?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    industry?: string;
    phone?: string;
    city?: string;
    state?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Make authenticated request to HubSpot API
 */
async function makeHubSpotRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' = 'GET',
  body?: unknown
): Promise<T> {
  if (!HUBSPOT_API_KEY) {
    throw new Error('HubSpot API key not configured. Set HUBSPOT_API_KEY.');
  }

  const url = `${HUBSPOT_BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info({ method, endpoint }, 'Making HubSpot API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Create contact
 */
async function createContactInternal(
  properties: Record<string, unknown>
): Promise<HubSpotContact> {
  logger.info({ email: properties.email }, 'Creating HubSpot contact');

  const result = await makeHubSpotRequest<HubSpotContact>(
    '/crm/v3/objects/contacts',
    'POST',
    { properties }
  );

  logger.info({ contactId: result.id }, 'HubSpot contact created');
  return result;
}

const createContactWithBreaker = createCircuitBreaker(createContactInternal, {
  timeout: 15000,
  name: 'hubspot-create-contact',
});

const createContactRateLimited = withRateLimit(
  async (properties: Record<string, unknown>) =>
    createContactWithBreaker.fire(properties),
  hubspotRateLimiter
);

export async function createContact(
  properties: Record<string, unknown>
): Promise<HubSpotContact> {
  return (await createContactRateLimited(properties)) as unknown as HubSpotContact;
}

/**
 * Update contact
 */
export async function updateContact(
  contactId: string,
  properties: Record<string, unknown>
): Promise<HubSpotContact> {
  logger.info({ contactId }, 'Updating HubSpot contact');

  const result = await makeHubSpotRequest<HubSpotContact>(
    `/crm/v3/objects/contacts/${contactId}`,
    'PATCH',
    { properties }
  );

  logger.info({ contactId: result.id }, 'HubSpot contact updated');
  return result;
}

/**
 * Get contact by ID
 */
export async function getContact(
  contactId: string,
  properties?: string[]
): Promise<HubSpotContact> {
  logger.info({ contactId }, 'Getting HubSpot contact');

  const queryParams = properties
    ? `?properties=${properties.join(',')}`
    : '';

  const result = await makeHubSpotRequest<HubSpotContact>(
    `/crm/v3/objects/contacts/${contactId}${queryParams}`,
    'GET'
  );

  logger.info({ contactId: result.id }, 'HubSpot contact retrieved');
  return result;
}

/**
 * Search contacts
 */
export async function searchContacts(
  filters: Array<{
    propertyName: string;
    operator: string;
    value: string;
  }>,
  limit: number = 10
): Promise<HubSpotContact[]> {
  logger.info({ filterCount: filters.length, limit }, 'Searching HubSpot contacts');

  const result = await makeHubSpotRequest<{ results: HubSpotContact[] }>(
    '/crm/v3/objects/contacts/search',
    'POST',
    {
      filterGroups: [{ filters }],
      limit,
    }
  );

  logger.info({ resultCount: result.results.length }, 'HubSpot contacts search completed');
  return result.results;
}

/**
 * Create deal
 */
export async function createDeal(
  properties: Record<string, unknown>
): Promise<HubSpotDeal> {
  logger.info({ dealname: properties.dealname }, 'Creating HubSpot deal');

  const result = await makeHubSpotRequest<HubSpotDeal>(
    '/crm/v3/objects/deals',
    'POST',
    { properties }
  );

  logger.info({ dealId: result.id }, 'HubSpot deal created');
  return result;
}

/**
 * Update deal
 */
export async function updateDeal(
  dealId: string,
  properties: Record<string, unknown>
): Promise<HubSpotDeal> {
  logger.info({ dealId }, 'Updating HubSpot deal');

  const result = await makeHubSpotRequest<HubSpotDeal>(
    `/crm/v3/objects/deals/${dealId}`,
    'PATCH',
    { properties }
  );

  logger.info({ dealId: result.id }, 'HubSpot deal updated');
  return result;
}

/**
 * Get deal by ID
 */
export async function getDeal(
  dealId: string,
  properties?: string[]
): Promise<HubSpotDeal> {
  logger.info({ dealId }, 'Getting HubSpot deal');

  const queryParams = properties
    ? `?properties=${properties.join(',')}`
    : '';

  const result = await makeHubSpotRequest<HubSpotDeal>(
    `/crm/v3/objects/deals/${dealId}${queryParams}`,
    'GET'
  );

  logger.info({ dealId: result.id }, 'HubSpot deal retrieved');
  return result;
}

/**
 * Search deals
 */
export async function searchDeals(
  filters: Array<{
    propertyName: string;
    operator: string;
    value: string;
  }>,
  limit: number = 10
): Promise<HubSpotDeal[]> {
  logger.info({ filterCount: filters.length, limit }, 'Searching HubSpot deals');

  const result = await makeHubSpotRequest<{ results: HubSpotDeal[] }>(
    '/crm/v3/objects/deals/search',
    'POST',
    {
      filterGroups: [{ filters }],
      limit,
    }
  );

  logger.info({ resultCount: result.results.length }, 'HubSpot deals search completed');
  return result.results;
}

/**
 * Create company
 */
export async function createCompany(
  properties: Record<string, unknown>
): Promise<HubSpotCompany> {
  logger.info({ name: properties.name }, 'Creating HubSpot company');

  const result = await makeHubSpotRequest<HubSpotCompany>(
    '/crm/v3/objects/companies',
    'POST',
    { properties }
  );

  logger.info({ companyId: result.id }, 'HubSpot company created');
  return result;
}

/**
 * Update company
 */
export async function updateCompany(
  companyId: string,
  properties: Record<string, unknown>
): Promise<HubSpotCompany> {
  logger.info({ companyId }, 'Updating HubSpot company');

  const result = await makeHubSpotRequest<HubSpotCompany>(
    `/crm/v3/objects/companies/${companyId}`,
    'PATCH',
    { properties }
  );

  logger.info({ companyId: result.id }, 'HubSpot company updated');
  return result;
}

/**
 * Get company by ID
 */
export async function getCompany(
  companyId: string,
  properties?: string[]
): Promise<HubSpotCompany> {
  logger.info({ companyId }, 'Getting HubSpot company');

  const queryParams = properties
    ? `?properties=${properties.join(',')}`
    : '';

  const result = await makeHubSpotRequest<HubSpotCompany>(
    `/crm/v3/objects/companies/${companyId}${queryParams}`,
    'GET'
  );

  logger.info({ companyId: result.id }, 'HubSpot company retrieved');
  return result;
}

/**
 * Search companies
 */
export async function searchCompanies(
  filters: Array<{
    propertyName: string;
    operator: string;
    value: string;
  }>,
  limit: number = 10
): Promise<HubSpotCompany[]> {
  logger.info({ filterCount: filters.length, limit }, 'Searching HubSpot companies');

  const result = await makeHubSpotRequest<{ results: HubSpotCompany[] }>(
    '/crm/v3/objects/companies/search',
    'POST',
    {
      filterGroups: [{ filters }],
      limit,
    }
  );

  logger.info({ resultCount: result.results.length }, 'HubSpot companies search completed');
  return result.results;
}

/**
 * Associate contact with company
 */
export async function associateContactWithCompany(
  contactId: string,
  companyId: string
): Promise<void> {
  logger.info({ contactId, companyId }, 'Associating contact with company');

  await makeHubSpotRequest(
    `/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`,
    'PUT'
  );

  logger.info('Contact associated with company');
}

/**
 * Associate deal with contact
 */
export async function associateDealWithContact(
  dealId: string,
  contactId: string
): Promise<void> {
  logger.info({ dealId, contactId }, 'Associating deal with contact');

  await makeHubSpotRequest(
    `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`,
    'PUT'
  );

  logger.info('Deal associated with contact');
}

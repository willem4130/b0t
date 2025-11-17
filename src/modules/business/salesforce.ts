import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Salesforce CRM Module
 *
 * Manage leads, opportunities, accounts, and execute SOQL queries
 * - Create/update leads
 * - Create/update opportunities
 * - Create/update accounts
 * - Execute SOQL queries
 * - Get records by ID
 * - Convert leads
 * - Built-in resilience
 *
 * Perfect for:
 * - Enterprise sales automation
 * - Lead qualification workflows
 * - Opportunity tracking
 * - Customer relationship management
 */

const SALESFORCE_INSTANCE_URL = process.env.SALESFORCE_INSTANCE_URL;
const SALESFORCE_ACCESS_TOKEN = process.env.SALESFORCE_ACCESS_TOKEN;

if (!SALESFORCE_INSTANCE_URL || !SALESFORCE_ACCESS_TOKEN) {
  logger.warn(
    '⚠️  SALESFORCE_INSTANCE_URL or SALESFORCE_ACCESS_TOKEN not set. Salesforce features will not work.'
  );
}

// Rate limiter: Salesforce has various limits, conservative approach
const salesforceRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 200, // 200ms between requests
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 10000,
  id: 'salesforce',
});

export interface SalesforceLead {
  Id?: string;
  FirstName?: string;
  LastName: string;
  Company: string;
  Email?: string;
  Phone?: string;
  Status?: string;
  [key: string]: unknown;
}

export interface SalesforceOpportunity {
  Id?: string;
  Name: string;
  StageName: string;
  CloseDate: string;
  Amount?: number;
  AccountId?: string;
  [key: string]: unknown;
}

export interface SalesforceAccount {
  Id?: string;
  Name: string;
  Phone?: string;
  Industry?: string;
  Website?: string;
  BillingCity?: string;
  BillingState?: string;
  [key: string]: unknown;
}

export interface SOQLQueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
}

/**
 * Make authenticated request to Salesforce API
 */
async function makeSalesforceRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  if (!SALESFORCE_INSTANCE_URL || !SALESFORCE_ACCESS_TOKEN) {
    throw new Error(
      'Salesforce credentials not configured. Set SALESFORCE_INSTANCE_URL and SALESFORCE_ACCESS_TOKEN.'
    );
  }

  const url = `${SALESFORCE_INSTANCE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${SALESFORCE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info({ method, endpoint }, 'Making Salesforce API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Salesforce API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Execute SOQL query
 */
async function executeSOQLInternal<T>(
  query: string
): Promise<SOQLQueryResult<T>> {
  logger.info({ query }, 'Executing SOQL query');

  const encodedQuery = encodeURIComponent(query);
  const result = await makeSalesforceRequest<SOQLQueryResult<T>>(
    `/services/data/v59.0/query?q=${encodedQuery}`,
    'GET'
  );

  logger.info({ totalSize: result.totalSize }, 'SOQL query executed');
  return result;
}

const executeSOQLWithBreaker = createCircuitBreaker(executeSOQLInternal, {
  timeout: 30000,
  name: 'salesforce-soql-query',
});

const executeSOQLRateLimited = withRateLimit(
  async (query: string) => executeSOQLWithBreaker.fire(query),
  salesforceRateLimiter
);

export async function executeSOQL<T>(
  query: string
): Promise<SOQLQueryResult<T>> {
  return (await executeSOQLRateLimited(query)) as unknown as SOQLQueryResult<T>;
}

/**
 * Create lead
 */
async function createLeadInternal(lead: SalesforceLead): Promise<{ id: string }> {
  logger.info({ lastName: lead.LastName, company: lead.Company }, 'Creating Salesforce lead');

  const result = await makeSalesforceRequest<{ id: string }>(
    '/services/data/v59.0/sobjects/Lead',
    'POST',
    lead
  );

  logger.info({ leadId: result.id }, 'Salesforce lead created');
  return result;
}

const createLeadWithBreaker = createCircuitBreaker(createLeadInternal, {
  timeout: 15000,
  name: 'salesforce-create-lead',
});

const createLeadRateLimited = withRateLimit(
  async (lead: SalesforceLead) => createLeadWithBreaker.fire(lead),
  salesforceRateLimiter
);

export async function createLead(lead: SalesforceLead): Promise<{ id: string }> {
  return (await createLeadRateLimited(lead)) as unknown as { id: string };
}

/**
 * Update lead
 */
export async function updateLead(
  leadId: string,
  updates: Partial<SalesforceLead>
): Promise<void> {
  logger.info({ leadId }, 'Updating Salesforce lead');

  await makeSalesforceRequest(
    `/services/data/v59.0/sobjects/Lead/${leadId}`,
    'PATCH',
    updates
  );

  logger.info({ leadId }, 'Salesforce lead updated');
}

/**
 * Get lead by ID
 */
export async function getLead(leadId: string): Promise<SalesforceLead> {
  logger.info({ leadId }, 'Getting Salesforce lead');

  const result = await makeSalesforceRequest<SalesforceLead>(
    `/services/data/v59.0/sobjects/Lead/${leadId}`,
    'GET'
  );

  logger.info({ leadId: result.Id }, 'Salesforce lead retrieved');
  return result;
}

/**
 * Convert lead to account, contact, and opportunity
 */
export async function convertLead(
  leadId: string,
  options?: {
    convertedStatus?: string;
    accountId?: string;
    contactId?: string;
    opportunityName?: string;
  }
): Promise<{
  accountId: string;
  contactId: string;
  opportunityId?: string;
}> {
  logger.info({ leadId }, 'Converting Salesforce lead');

  const result = await makeSalesforceRequest<{
    accountId: string;
    contactId: string;
    opportunityId?: string;
  }>('/services/data/v59.0/actions/standard/convertLead', 'POST', {
    inputs: [
      {
        leadId,
        convertedStatus: options?.convertedStatus || 'Qualified',
        accountId: options?.accountId,
        contactId: options?.contactId,
        opportunityName: options?.opportunityName,
      },
    ],
  });

  logger.info({ accountId: result.accountId }, 'Salesforce lead converted');
  return result;
}

/**
 * Create opportunity
 */
export async function createOpportunity(
  opportunity: SalesforceOpportunity
): Promise<{ id: string }> {
  logger.info({ name: opportunity.Name }, 'Creating Salesforce opportunity');

  const result = await makeSalesforceRequest<{ id: string }>(
    '/services/data/v59.0/sobjects/Opportunity',
    'POST',
    opportunity
  );

  logger.info({ opportunityId: result.id }, 'Salesforce opportunity created');
  return result;
}

/**
 * Update opportunity
 */
export async function updateOpportunity(
  opportunityId: string,
  updates: Partial<SalesforceOpportunity>
): Promise<void> {
  logger.info({ opportunityId }, 'Updating Salesforce opportunity');

  await makeSalesforceRequest(
    `/services/data/v59.0/sobjects/Opportunity/${opportunityId}`,
    'PATCH',
    updates
  );

  logger.info({ opportunityId }, 'Salesforce opportunity updated');
}

/**
 * Get opportunity by ID
 */
export async function getOpportunity(
  opportunityId: string
): Promise<SalesforceOpportunity> {
  logger.info({ opportunityId }, 'Getting Salesforce opportunity');

  const result = await makeSalesforceRequest<SalesforceOpportunity>(
    `/services/data/v59.0/sobjects/Opportunity/${opportunityId}`,
    'GET'
  );

  logger.info({ opportunityId: result.Id }, 'Salesforce opportunity retrieved');
  return result;
}

/**
 * Create account
 */
export async function createAccount(
  account: SalesforceAccount
): Promise<{ id: string }> {
  logger.info({ name: account.Name }, 'Creating Salesforce account');

  const result = await makeSalesforceRequest<{ id: string }>(
    '/services/data/v59.0/sobjects/Account',
    'POST',
    account
  );

  logger.info({ accountId: result.id }, 'Salesforce account created');
  return result;
}

/**
 * Update account
 */
export async function updateAccount(
  accountId: string,
  updates: Partial<SalesforceAccount>
): Promise<void> {
  logger.info({ accountId }, 'Updating Salesforce account');

  await makeSalesforceRequest(
    `/services/data/v59.0/sobjects/Account/${accountId}`,
    'PATCH',
    updates
  );

  logger.info({ accountId }, 'Salesforce account updated');
}

/**
 * Get account by ID
 */
export async function getAccount(accountId: string): Promise<SalesforceAccount> {
  logger.info({ accountId }, 'Getting Salesforce account');

  const result = await makeSalesforceRequest<SalesforceAccount>(
    `/services/data/v59.0/sobjects/Account/${accountId}`,
    'GET'
  );

  logger.info({ accountId: result.Id }, 'Salesforce account retrieved');
  return result;
}

/**
 * Search records using SOSL (Salesforce Object Search Language)
 */
export async function searchSOSL(
  searchQuery: string
): Promise<Array<{ attributes: { type: string; url: string }; Id: string }>> {
  logger.info({ searchQuery }, 'Executing SOSL search');

  const encodedQuery = encodeURIComponent(searchQuery);
  const result = await makeSalesforceRequest<{ searchRecords: never[] }>(
    `/services/data/v59.0/search?q=${encodedQuery}`,
    'GET'
  );

  logger.info(
    { resultCount: result.searchRecords.length },
    'SOSL search completed'
  );
  return result.searchRecords as Array<{
    attributes: { type: string; url: string };
    Id: string;
  }>;
}

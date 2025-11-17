import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Pipedrive CRM Module
 *
 * Manage deals, persons, organizations, and sales pipelines
 * - Create/update deals
 * - Create/update persons (contacts)
 * - Create/update organizations
 * - Get pipelines and stages
 * - Search and filter records
 * - Track activities
 * - Built-in resilience
 *
 * Perfect for:
 * - Sales pipeline automation
 * - Deal tracking workflows
 * - Contact management
 * - Lead nurturing
 */

const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_DOMAIN || 'api.pipedrive.com';

if (!PIPEDRIVE_API_TOKEN) {
  logger.warn('⚠️  PIPEDRIVE_API_TOKEN not set. Pipedrive features will not work.');
}

// Rate limiter: Pipedrive allows ~120 req/min per company
const pipedriveRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 500, // 500ms between requests = ~2/sec
  reservoir: 120,
  reservoirRefreshAmount: 120,
  reservoirRefreshInterval: 60000,
  id: 'pipedrive',
});

export interface PipedriveDeal {
  id?: number;
  title: string;
  value?: number;
  currency?: string;
  person_id?: number;
  org_id?: number;
  stage_id?: number;
  status?: string;
  expected_close_date?: string;
  [key: string]: unknown;
}

export interface PipedrivePerson {
  id?: number;
  name: string;
  email?: Array<{ value: string; primary: boolean }>;
  phone?: Array<{ value: string; primary: boolean }>;
  org_id?: number;
  [key: string]: unknown;
}

export interface PipedriveOrganization {
  id?: number;
  name: string;
  address?: string;
  owner_id?: number;
  [key: string]: unknown;
}

export interface PipedrivePipeline {
  id: number;
  name: string;
  url_title: string;
  active: boolean;
  order_nr: number;
}

export interface PipedriveStage {
  id: number;
  name: string;
  pipeline_id: number;
  order_nr: number;
  rotten_flag: boolean;
}

/**
 * Make authenticated request to Pipedrive API
 */
async function makePipedriveRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  if (!PIPEDRIVE_API_TOKEN) {
    throw new Error('Pipedrive API token not configured. Set PIPEDRIVE_API_TOKEN.');
  }

  const url = `https://${PIPEDRIVE_DOMAIN}/v1${endpoint}${
    endpoint.includes('?') ? '&' : '?'
  }api_token=${PIPEDRIVE_API_TOKEN}`;

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.info({ method, endpoint }, 'Making Pipedrive API request');

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pipedrive API error (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as { success: boolean; data: T };

  if (!result.success) {
    throw new Error('Pipedrive API request failed');
  }

  return result.data;
}

/**
 * Create deal
 */
async function createDealInternal(deal: PipedriveDeal): Promise<PipedriveDeal> {
  logger.info({ title: deal.title }, 'Creating Pipedrive deal');

  const result = await makePipedriveRequest<PipedriveDeal>(
    '/deals',
    'POST',
    deal
  );

  logger.info({ dealId: result.id }, 'Pipedrive deal created');
  return result;
}

const createDealWithBreaker = createCircuitBreaker(createDealInternal, {
  timeout: 15000,
  name: 'pipedrive-create-deal',
});

const createDealRateLimited = withRateLimit(
  async (deal: PipedriveDeal) => createDealWithBreaker.fire(deal),
  pipedriveRateLimiter
);

export async function createDeal(deal: PipedriveDeal): Promise<PipedriveDeal> {
  return (await createDealRateLimited(deal)) as unknown as PipedriveDeal;
}

/**
 * Update deal
 */
export async function updateDeal(
  dealId: number,
  updates: Partial<PipedriveDeal>
): Promise<PipedriveDeal> {
  logger.info({ dealId }, 'Updating Pipedrive deal');

  const result = await makePipedriveRequest<PipedriveDeal>(
    `/deals/${dealId}`,
    'PUT',
    updates
  );

  logger.info({ dealId: result.id }, 'Pipedrive deal updated');
  return result;
}

/**
 * Get deal by ID
 */
export async function getDeal(dealId: number): Promise<PipedriveDeal> {
  logger.info({ dealId }, 'Getting Pipedrive deal');

  const result = await makePipedriveRequest<PipedriveDeal>(
    `/deals/${dealId}`,
    'GET'
  );

  logger.info({ dealId: result.id }, 'Pipedrive deal retrieved');
  return result;
}

/**
 * Search deals
 */
export async function searchDeals(
  term: string,
  limit: number = 10
): Promise<PipedriveDeal[]> {
  logger.info({ term, limit }, 'Searching Pipedrive deals');

  const result = await makePipedriveRequest<{ items: PipedriveDeal[] }>(
    `/deals/search?term=${encodeURIComponent(term)}&limit=${limit}`,
    'GET'
  );

  logger.info({ resultCount: result.items?.length || 0 }, 'Pipedrive deals search completed');
  return result.items || [];
}

/**
 * Create person (contact)
 */
export async function createPerson(
  person: PipedrivePerson
): Promise<PipedrivePerson> {
  logger.info({ name: person.name }, 'Creating Pipedrive person');

  const result = await makePipedriveRequest<PipedrivePerson>(
    '/persons',
    'POST',
    person
  );

  logger.info({ personId: result.id }, 'Pipedrive person created');
  return result;
}

/**
 * Update person
 */
export async function updatePerson(
  personId: number,
  updates: Partial<PipedrivePerson>
): Promise<PipedrivePerson> {
  logger.info({ personId }, 'Updating Pipedrive person');

  const result = await makePipedriveRequest<PipedrivePerson>(
    `/persons/${personId}`,
    'PUT',
    updates
  );

  logger.info({ personId: result.id }, 'Pipedrive person updated');
  return result;
}

/**
 * Get person by ID
 */
export async function getPerson(personId: number): Promise<PipedrivePerson> {
  logger.info({ personId }, 'Getting Pipedrive person');

  const result = await makePipedriveRequest<PipedrivePerson>(
    `/persons/${personId}`,
    'GET'
  );

  logger.info({ personId: result.id }, 'Pipedrive person retrieved');
  return result;
}

/**
 * Search persons
 */
export async function searchPersons(
  term: string,
  limit: number = 10
): Promise<PipedrivePerson[]> {
  logger.info({ term, limit }, 'Searching Pipedrive persons');

  const result = await makePipedriveRequest<{ items: PipedrivePerson[] }>(
    `/persons/search?term=${encodeURIComponent(term)}&limit=${limit}`,
    'GET'
  );

  logger.info({ resultCount: result.items?.length || 0 }, 'Pipedrive persons search completed');
  return result.items || [];
}

/**
 * Create organization
 */
export async function createOrganization(
  organization: PipedriveOrganization
): Promise<PipedriveOrganization> {
  logger.info({ name: organization.name }, 'Creating Pipedrive organization');

  const result = await makePipedriveRequest<PipedriveOrganization>(
    '/organizations',
    'POST',
    organization
  );

  logger.info({ organizationId: result.id }, 'Pipedrive organization created');
  return result;
}

/**
 * Update organization
 */
export async function updateOrganization(
  organizationId: number,
  updates: Partial<PipedriveOrganization>
): Promise<PipedriveOrganization> {
  logger.info({ organizationId }, 'Updating Pipedrive organization');

  const result = await makePipedriveRequest<PipedriveOrganization>(
    `/organizations/${organizationId}`,
    'PUT',
    updates
  );

  logger.info({ organizationId: result.id }, 'Pipedrive organization updated');
  return result;
}

/**
 * Get organization by ID
 */
export async function getOrganization(
  organizationId: number
): Promise<PipedriveOrganization> {
  logger.info({ organizationId }, 'Getting Pipedrive organization');

  const result = await makePipedriveRequest<PipedriveOrganization>(
    `/organizations/${organizationId}`,
    'GET'
  );

  logger.info({ organizationId: result.id }, 'Pipedrive organization retrieved');
  return result;
}

/**
 * Search organizations
 */
export async function searchOrganizations(
  term: string,
  limit: number = 10
): Promise<PipedriveOrganization[]> {
  logger.info({ term, limit }, 'Searching Pipedrive organizations');

  const result = await makePipedriveRequest<{ items: PipedriveOrganization[] }>(
    `/organizations/search?term=${encodeURIComponent(term)}&limit=${limit}`,
    'GET'
  );

  logger.info(
    { resultCount: result.items?.length || 0 },
    'Pipedrive organizations search completed'
  );
  return result.items || [];
}

/**
 * Get all pipelines
 */
export async function getPipelines(): Promise<PipedrivePipeline[]> {
  logger.info('Getting Pipedrive pipelines');

  const result = await makePipedriveRequest<PipedrivePipeline[]>(
    '/pipelines',
    'GET'
  );

  logger.info({ pipelineCount: result.length }, 'Pipedrive pipelines retrieved');
  return result;
}

/**
 * Get pipeline stages
 */
export async function getPipelineStages(
  pipelineId: number
): Promise<PipedriveStage[]> {
  logger.info({ pipelineId }, 'Getting Pipedrive pipeline stages');

  const result = await makePipedriveRequest<PipedriveStage[]>(
    `/stages?pipeline_id=${pipelineId}`,
    'GET'
  );

  logger.info({ stageCount: result.length }, 'Pipedrive stages retrieved');
  return result;
}

/**
 * Create activity
 */
export async function createActivity(activity: {
  subject: string;
  type: string;
  due_date?: string;
  due_time?: string;
  duration?: string;
  deal_id?: number;
  person_id?: number;
  org_id?: number;
  note?: string;
}): Promise<{ id: number }> {
  logger.info({ subject: activity.subject }, 'Creating Pipedrive activity');

  const result = await makePipedriveRequest<{ id: number }>(
    '/activities',
    'POST',
    activity
  );

  logger.info({ activityId: result.id }, 'Pipedrive activity created');
  return result;
}

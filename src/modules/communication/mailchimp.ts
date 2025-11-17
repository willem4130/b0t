// @ts-expect-error - No types available
import mailchimp from '@mailchimp/mailchimp_marketing';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Mailchimp Module
 *
 * Manage email marketing campaigns and subscriber lists
 * - Add/update/remove subscribers
 * - Create and send campaigns
 * - Get campaign statistics
 * - Tag subscribers
 * - Create email templates
 * - Built-in resilience
 *
 * Perfect for:
 * - Email marketing automation
 * - Newsletter management
 * - Subscriber segmentation
 * - Campaign analytics
 * - Drip campaigns
 */

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const MAILCHIMP_SERVER_PREFIX = process.env.MAILCHIMP_SERVER_PREFIX;

if (!MAILCHIMP_API_KEY || !MAILCHIMP_SERVER_PREFIX) {
  logger.warn('⚠️  MAILCHIMP_API_KEY or MAILCHIMP_SERVER_PREFIX not set. Mailchimp features will not work.');
}

// Initialize Mailchimp client
if (MAILCHIMP_API_KEY && MAILCHIMP_SERVER_PREFIX) {
  mailchimp.setConfig({
    apiKey: MAILCHIMP_API_KEY,
    server: MAILCHIMP_SERVER_PREFIX,
  });
}

const mailchimpClient = MAILCHIMP_API_KEY && MAILCHIMP_SERVER_PREFIX ? mailchimp : null;

// Rate limiter: Mailchimp allows 10 requests per second
const mailchimpRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 100, // 100ms between requests = 10 req/sec
  reservoir: 600,
  reservoirRefreshAmount: 600,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'mailchimp',
});

export interface AddSubscriberOptions {
  listId: string;
  email: string;
  status?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
  mergeFields?: Record<string, string>; // FNAME, LNAME, etc.
  tags?: string[];
  interests?: Record<string, boolean>;
}

export interface SubscriberResponse {
  id: string;
  email: string;
  status: string;
  mergeFields: Record<string, string>;
  tags: { id: number; name: string }[];
}

/**
 * Add subscriber to list (internal)
 */
async function addSubscriberInternal(
  options: AddSubscriberOptions
): Promise<SubscriberResponse> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info(
    {
      listId: options.listId,
      email: options.email,
      status: options.status,
      hasMergeFields: !!options.mergeFields,
      hasTags: !!options.tags,
    },
    'Adding subscriber to Mailchimp list'
  );

  const response = await mailchimpClient.lists.addListMember(options.listId, {
    email_address: options.email,
    status: options.status || 'subscribed',
    merge_fields: options.mergeFields,
    tags: options.tags,
    interests: options.interests,
  });

  logger.info({ subscriberId: response.id, email: response.email_address }, 'Subscriber added to Mailchimp');

  return {
    id: response.id,
    email: response.email_address,
    status: response.status,
    mergeFields: response.merge_fields,
    tags: response.tags || [],
  };
}

const addSubscriberWithBreaker = createCircuitBreaker(addSubscriberInternal, {
  timeout: 15000,
  name: 'mailchimp-add-subscriber',
});

const addSubscriberRateLimited = withRateLimit(
  async (options: AddSubscriberOptions) => addSubscriberWithBreaker.fire(options),
  mailchimpRateLimiter
);

export async function addSubscriber(
  options: AddSubscriberOptions
): Promise<SubscriberResponse> {
  return await addSubscriberRateLimited(options) as unknown as SubscriberResponse;
}

export interface UpdateSubscriberOptions {
  listId: string;
  subscriberId: string;
  email?: string;
  status?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
  mergeFields?: Record<string, string>;
  interests?: Record<string, boolean>;
}

/**
 * Update subscriber information (internal)
 */
async function updateSubscriberInternal(
  options: UpdateSubscriberOptions
): Promise<SubscriberResponse> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info(
    {
      listId: options.listId,
      subscriberId: options.subscriberId,
      hasEmail: !!options.email,
      hasStatus: !!options.status,
      hasMergeFields: !!options.mergeFields,
    },
    'Updating subscriber in Mailchimp'
  );

  const updateData: {
    email_address?: string;
    status?: string;
    merge_fields?: Record<string, string>;
    interests?: Record<string, boolean>;
  } = {};

  if (options.email) updateData.email_address = options.email;
  if (options.status) updateData.status = options.status;
  if (options.mergeFields) updateData.merge_fields = options.mergeFields;
  if (options.interests) updateData.interests = options.interests;

  const response = await mailchimpClient.lists.updateListMember(
    options.listId,
    options.subscriberId,
    updateData
  );

  logger.info({ subscriberId: response.id, email: response.email_address }, 'Subscriber updated in Mailchimp');

  return {
    id: response.id,
    email: response.email_address,
    status: response.status,
    mergeFields: response.merge_fields,
    tags: response.tags || [],
  };
}

const updateSubscriberWithBreaker = createCircuitBreaker(updateSubscriberInternal, {
  timeout: 15000,
  name: 'mailchimp-update-subscriber',
});

const updateSubscriberRateLimited = withRateLimit(
  async (options: UpdateSubscriberOptions) => updateSubscriberWithBreaker.fire(options),
  mailchimpRateLimiter
);

export async function updateSubscriber(
  options: UpdateSubscriberOptions
): Promise<SubscriberResponse> {
  return await updateSubscriberRateLimited(options) as unknown as SubscriberResponse;
}

export interface RemoveSubscriberOptions {
  listId: string;
  subscriberId: string;
}

/**
 * Remove subscriber from list (internal)
 */
async function removeSubscriberInternal(
  options: RemoveSubscriberOptions
): Promise<void> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info(
    {
      listId: options.listId,
      subscriberId: options.subscriberId,
    },
    'Removing subscriber from Mailchimp list'
  );

  await mailchimpClient.lists.deleteListMember(
    options.listId,
    options.subscriberId
  );

  logger.info({ subscriberId: options.subscriberId }, 'Subscriber removed from Mailchimp');
}

const removeSubscriberWithBreaker = createCircuitBreaker(removeSubscriberInternal, {
  timeout: 15000,
  name: 'mailchimp-remove-subscriber',
});

const removeSubscriberRateLimited = withRateLimit(
  async (options: RemoveSubscriberOptions) => removeSubscriberWithBreaker.fire(options),
  mailchimpRateLimiter
);

export async function removeSubscriber(
  options: RemoveSubscriberOptions
): Promise<void> {
  return await removeSubscriberRateLimited(options) as unknown as void;
}

export interface CreateCampaignOptions {
  type: 'regular' | 'plaintext' | 'absplit' | 'rss' | 'variate';
  recipients: {
    listId: string;
    segmentOpts?: {
      savedSegmentId?: number;
      match?: 'any' | 'all';
      conditions?: unknown[];
    };
  };
  settings: {
    subjectLine: string;
    title: string;
    fromName: string;
    replyTo: string;
    previewText?: string;
    templateId?: number;
  };
}

export interface CampaignResponse {
  id: string;
  webId: number;
  type: string;
  status: string;
  settings: {
    subjectLine: string;
    title: string;
    fromName: string;
    replyTo: string;
  };
}

/**
 * Create email campaign (internal)
 */
async function createCampaignInternal(
  options: CreateCampaignOptions
): Promise<CampaignResponse> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info(
    {
      type: options.type,
      listId: options.recipients.listId,
      subjectLine: options.settings.subjectLine,
    },
    'Creating Mailchimp campaign'
  );

  const response = await mailchimpClient.campaigns.create({
    type: options.type,
    recipients: {
      list_id: options.recipients.listId,
      segment_opts: options.recipients.segmentOpts,
    },
    settings: {
      subject_line: options.settings.subjectLine,
      title: options.settings.title,
      from_name: options.settings.fromName,
      reply_to: options.settings.replyTo,
      preview_text: options.settings.previewText,
      template_id: options.settings.templateId,
    },
  });

  logger.info({ campaignId: response.id, status: response.status }, 'Campaign created in Mailchimp');

  return {
    id: response.id,
    webId: response.web_id,
    type: response.type,
    status: response.status,
    settings: {
      subjectLine: response.settings.subject_line,
      title: response.settings.title,
      fromName: response.settings.from_name,
      replyTo: response.settings.reply_to,
    },
  };
}

const createCampaignWithBreaker = createCircuitBreaker(createCampaignInternal, {
  timeout: 15000,
  name: 'mailchimp-create-campaign',
});

const createCampaignRateLimited = withRateLimit(
  async (options: CreateCampaignOptions) => createCampaignWithBreaker.fire(options),
  mailchimpRateLimiter
);

export async function createCampaign(
  options: CreateCampaignOptions
): Promise<CampaignResponse> {
  return await createCampaignRateLimited(options) as unknown as CampaignResponse;
}

export interface SendCampaignOptions {
  campaignId: string;
}

/**
 * Send campaign to subscribers (internal)
 */
async function sendCampaignInternal(
  options: SendCampaignOptions
): Promise<void> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info({ campaignId: options.campaignId }, 'Sending Mailchimp campaign');

  await mailchimpClient.campaigns.send(options.campaignId);

  logger.info({ campaignId: options.campaignId }, 'Campaign sent via Mailchimp');
}

const sendCampaignWithBreaker = createCircuitBreaker(sendCampaignInternal, {
  timeout: 15000,
  name: 'mailchimp-send-campaign',
});

const sendCampaignRateLimited = withRateLimit(
  async (options: SendCampaignOptions) => sendCampaignWithBreaker.fire(options),
  mailchimpRateLimiter
);

export async function sendCampaign(
  options: SendCampaignOptions
): Promise<void> {
  return await sendCampaignRateLimited(options) as unknown as void;
}

export interface CampaignStats {
  campaignId: string;
  emails_sent: number;
  opens: {
    opens_total: number;
    unique_opens: number;
    open_rate: number;
    last_open: string | null;
  };
  clicks: {
    clicks_total: number;
    unique_clicks: number;
    unique_subscriber_clicks: number;
    click_rate: number;
    last_click: string | null;
  };
  bounces: {
    hard_bounces: number;
    soft_bounces: number;
    syntax_errors: number;
  };
  unsubscribed: number;
}

/**
 * Get campaign statistics (internal)
 */
async function getCampaignStatsInternal(
  campaignId: string
): Promise<CampaignStats> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info({ campaignId }, 'Fetching campaign stats from Mailchimp');

  const response = await mailchimpClient.reports.getCampaignReport(campaignId);

  logger.info(
    {
      campaignId,
      emailsSent: response.emails_sent,
      openRate: response.opens.open_rate,
      clickRate: response.clicks.click_rate,
    },
    'Campaign stats retrieved from Mailchimp'
  );

  return {
    campaignId: response.id,
    emails_sent: response.emails_sent,
    opens: {
      opens_total: response.opens.opens_total,
      unique_opens: response.opens.unique_opens,
      open_rate: response.opens.open_rate,
      last_open: response.opens.last_open,
    },
    clicks: {
      clicks_total: response.clicks.clicks_total,
      unique_clicks: response.clicks.unique_clicks,
      unique_subscriber_clicks: response.clicks.unique_subscriber_clicks,
      click_rate: response.clicks.click_rate,
      last_click: response.clicks.last_click,
    },
    bounces: {
      hard_bounces: response.bounces.hard_bounces,
      soft_bounces: response.bounces.soft_bounces,
      syntax_errors: response.bounces.syntax_errors,
    },
    unsubscribed: response.unsubscribed,
  };
}

const getCampaignStatsWithBreaker = createCircuitBreaker(getCampaignStatsInternal, {
  timeout: 15000,
  name: 'mailchimp-get-campaign-stats',
});

const getCampaignStatsRateLimited = withRateLimit(
  async (campaignId: string) => getCampaignStatsWithBreaker.fire(campaignId),
  mailchimpRateLimiter
);

export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats> {
  return await getCampaignStatsRateLimited(campaignId) as unknown as CampaignStats;
}

export interface AddTagOptions {
  listId: string;
  subscriberId: string;
  tags: { name: string; status: 'active' | 'inactive' }[];
}

/**
 * Add or remove tags from a subscriber (internal)
 */
async function addTagInternal(
  options: AddTagOptions
): Promise<void> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info(
    {
      listId: options.listId,
      subscriberId: options.subscriberId,
      tagCount: options.tags.length,
    },
    'Adding tags to subscriber in Mailchimp'
  );

  await mailchimpClient.lists.updateListMemberTags(
    options.listId,
    options.subscriberId,
    { tags: options.tags }
  );

  logger.info(
    { subscriberId: options.subscriberId, tags: options.tags.map(t => t.name) },
    'Tags updated in Mailchimp'
  );
}

const addTagWithBreaker = createCircuitBreaker(addTagInternal, {
  timeout: 15000,
  name: 'mailchimp-add-tag',
});

const addTagRateLimited = withRateLimit(
  async (options: AddTagOptions) => addTagWithBreaker.fire(options),
  mailchimpRateLimiter
);

export async function addTag(
  options: AddTagOptions
): Promise<void> {
  return await addTagRateLimited(options) as unknown as void;
}

export interface CreateTemplateOptions {
  name: string;
  html: string;
  folderId?: string;
}

export interface TemplateResponse {
  id: number;
  type: string;
  name: string;
  active: boolean;
  category: string;
  createdDate: string;
}

/**
 * Create email template (internal)
 */
async function createTemplateInternal(
  options: CreateTemplateOptions
): Promise<TemplateResponse> {
  if (!mailchimpClient) {
    throw new Error('Mailchimp client not initialized. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX.');
  }

  logger.info(
    {
      name: options.name,
      htmlLength: options.html.length,
      hasFolderId: !!options.folderId,
    },
    'Creating email template in Mailchimp'
  );

  const response = await mailchimpClient.templates.create({
    name: options.name,
    html: options.html,
    folder_id: options.folderId,
  });

  logger.info({ templateId: response.id, name: response.name }, 'Template created in Mailchimp');

  return {
    id: response.id,
    type: response.type,
    name: response.name,
    active: response.active,
    category: response.category,
    createdDate: response.date_created,
  };
}

const createTemplateWithBreaker = createCircuitBreaker(createTemplateInternal, {
  timeout: 15000,
  name: 'mailchimp-create-template',
});

const createTemplateRateLimited = withRateLimit(
  async (options: CreateTemplateOptions) => createTemplateWithBreaker.fire(options),
  mailchimpRateLimiter
);

export async function createTemplate(
  options: CreateTemplateOptions
): Promise<TemplateResponse> {
  return await createTemplateRateLimited(options) as unknown as TemplateResponse;
}

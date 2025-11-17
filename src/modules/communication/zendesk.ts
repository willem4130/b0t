import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Zendesk Module
 *
 * Customer support and ticketing system
 * - Create support tickets
 * - Update ticket status
 * - Add comments to tickets
 * - Get ticket details
 * - Search tickets
 * - Manage users
 * - Get ticket metrics
 * - Built-in resilience
 *
 * Perfect for:
 * - Customer support automation
 * - Ticket management
 * - Support workflows
 * - Customer communication
 * - Help desk operations
 */

const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL;
const ZENDESK_API_TOKEN = process.env.ZENDESK_API_TOKEN;

if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
  logger.warn('⚠️  Zendesk credentials not set. Set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN.');
}

const zendeskApiUrl = ZENDESK_SUBDOMAIN ? `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2` : '';

// Rate limiter: Zendesk allows 700 requests per minute
const zendeskRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // 100ms between requests
  reservoir: 700,
  reservoirRefreshAmount: 700,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'zendesk',
});

// Helper to create auth header
function getAuthHeader(): string {
  if (!ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    throw new Error('Zendesk credentials not set');
  }
  return `Basic ${Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString('base64')}`;
}

export interface CreateTicketOptions {
  subject: string;
  description: string;
  requesterEmail?: string;
  requesterId?: number;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  status?: 'new' | 'open' | 'pending' | 'hold' | 'solved' | 'closed';
  type?: 'problem' | 'incident' | 'question' | 'task';
  tags?: string[];
  assigneeId?: number;
  groupId?: number;
  customFields?: Array<{ id: number; value: string | number | boolean }>;
}

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  requesterId: number;
  assigneeId: number | null;
  groupId: number | null;
  url: string;
}

/**
 * Create a new support ticket
 */
async function createTicketInternal(options: CreateTicketOptions): Promise<Ticket> {
  if (!zendeskApiUrl) {
    throw new Error('Zendesk not configured. Set ZENDESK_SUBDOMAIN.');
  }

  logger.info(
    {
      subject: options.subject,
      priority: options.priority,
      type: options.type,
    },
    'Creating Zendesk ticket'
  );

  const ticketData: Record<string, unknown> = {
    subject: options.subject,
    comment: { body: options.description },
    priority: options.priority || 'normal',
    status: options.status || 'new',
    type: options.type || 'question',
  };

  if (options.requesterEmail) {
    ticketData.requester = { email: options.requesterEmail };
  } else if (options.requesterId) {
    ticketData.requester_id = options.requesterId;
  }

  if (options.tags) {
    ticketData.tags = options.tags;
  }
  if (options.assigneeId) {
    ticketData.assignee_id = options.assigneeId;
  }
  if (options.groupId) {
    ticketData.group_id = options.groupId;
  }
  if (options.customFields) {
    ticketData.custom_fields = options.customFields;
  }

  const response = await axios.post(
    `${zendeskApiUrl}/tickets.json`,
    { ticket: ticketData },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const ticket = response.data.ticket;

  logger.info({ ticketId: ticket.id, status: ticket.status }, 'Zendesk ticket created');

  return {
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    requesterId: ticket.requester_id,
    assigneeId: ticket.assignee_id,
    groupId: ticket.group_id,
    url: ticket.url,
  };
}

const createTicketWithBreaker = createCircuitBreaker(createTicketInternal, {
  timeout: 15000,
  name: 'zendesk-create-ticket',
});

const createTicketRateLimited = withRateLimit(
  async (options: CreateTicketOptions) => createTicketWithBreaker.fire(options),
  zendeskRateLimiter
);

export async function createTicket(options: CreateTicketOptions): Promise<Ticket> {
  return await createTicketRateLimited(options) as unknown as Ticket;
}

export interface UpdateTicketOptions {
  ticketId: number;
  subject?: string;
  status?: 'new' | 'open' | 'pending' | 'hold' | 'solved' | 'closed';
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  assigneeId?: number;
  groupId?: number;
  tags?: string[];
  customFields?: Array<{ id: number; value: string | number | boolean }>;
}

/**
 * Update an existing ticket
 */
async function updateTicketInternal(options: UpdateTicketOptions): Promise<Ticket> {
  if (!zendeskApiUrl) {
    throw new Error('Zendesk not configured. Set ZENDESK_SUBDOMAIN.');
  }

  logger.info({ ticketId: options.ticketId }, 'Updating Zendesk ticket');

  const updateData: Record<string, unknown> = {};

  if (options.subject) updateData.subject = options.subject;
  if (options.status) updateData.status = options.status;
  if (options.priority) updateData.priority = options.priority;
  if (options.assigneeId) updateData.assignee_id = options.assigneeId;
  if (options.groupId) updateData.group_id = options.groupId;
  if (options.tags) updateData.tags = options.tags;
  if (options.customFields) updateData.custom_fields = options.customFields;

  const response = await axios.put(
    `${zendeskApiUrl}/tickets/${options.ticketId}.json`,
    { ticket: updateData },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const ticket = response.data.ticket;

  logger.info({ ticketId: ticket.id, status: ticket.status }, 'Zendesk ticket updated');

  return {
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    requesterId: ticket.requester_id,
    assigneeId: ticket.assignee_id,
    groupId: ticket.group_id,
    url: ticket.url,
  };
}

const updateTicketWithBreaker = createCircuitBreaker(updateTicketInternal, {
  timeout: 15000,
  name: 'zendesk-update-ticket',
});

const updateTicketRateLimited = withRateLimit(
  async (options: UpdateTicketOptions) => updateTicketWithBreaker.fire(options),
  zendeskRateLimiter
);

export async function updateTicket(options: UpdateTicketOptions): Promise<Ticket> {
  return await updateTicketRateLimited(options) as unknown as Ticket;
}

export interface AddCommentOptions {
  ticketId: number;
  body: string;
  public?: boolean; // Public comment visible to requester
  authorId?: number;
  uploads?: string[]; // Upload tokens
}

export interface Comment {
  id: number;
  type: string;
  body: string;
  htmlBody: string;
  public: boolean;
  authorId: number;
  createdAt: string;
}

/**
 * Add comment to a ticket
 */
async function addCommentInternal(options: AddCommentOptions): Promise<{ ticket: Ticket; comment: Comment }> {
  if (!zendeskApiUrl) {
    throw new Error('Zendesk not configured. Set ZENDESK_SUBDOMAIN.');
  }

  logger.info(
    {
      ticketId: options.ticketId,
      isPublic: options.public !== false,
      bodyLength: options.body.length,
    },
    'Adding comment to Zendesk ticket'
  );

  const commentData: Record<string, unknown> = {
    body: options.body,
    public: options.public !== false,
  };

  if (options.authorId) {
    commentData.author_id = options.authorId;
  }
  if (options.uploads) {
    commentData.uploads = options.uploads;
  }

  const response = await axios.put(
    `${zendeskApiUrl}/tickets/${options.ticketId}.json`,
    { ticket: { comment: commentData } },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const ticket = response.data.ticket;

  logger.info({ ticketId: options.ticketId }, 'Comment added to Zendesk ticket');

  // Get the latest comment
  const commentsResponse = await axios.get(
    `${zendeskApiUrl}/tickets/${options.ticketId}/comments.json`,
    {
      headers: {
        Authorization: getAuthHeader(),
      },
    }
  );

  const latestComment = commentsResponse.data.comments[commentsResponse.data.comments.length - 1];

  return {
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      tags: ticket.tags,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      requesterId: ticket.requester_id,
      assigneeId: ticket.assignee_id,
      groupId: ticket.group_id,
      url: ticket.url,
    },
    comment: {
      id: latestComment.id,
      type: latestComment.type,
      body: latestComment.body,
      htmlBody: latestComment.html_body,
      public: latestComment.public,
      authorId: latestComment.author_id,
      createdAt: latestComment.created_at,
    },
  };
}

const addCommentWithBreaker = createCircuitBreaker(addCommentInternal, {
  timeout: 15000,
  name: 'zendesk-add-comment',
});

const addCommentRateLimited = withRateLimit(
  async (options: AddCommentOptions) => addCommentWithBreaker.fire(options),
  zendeskRateLimiter
);

export async function addComment(options: AddCommentOptions): Promise<{ ticket: Ticket; comment: Comment }> {
  return await addCommentRateLimited(options) as unknown as { ticket: Ticket; comment: Comment };
}

export interface GetTicketOptions {
  ticketId: number;
  includeComments?: boolean;
}

export interface TicketWithComments extends Ticket {
  comments?: Comment[];
}

/**
 * Get ticket details
 */
async function getTicketInternal(options: GetTicketOptions): Promise<TicketWithComments> {
  if (!zendeskApiUrl) {
    throw new Error('Zendesk not configured. Set ZENDESK_SUBDOMAIN.');
  }

  logger.info({ ticketId: options.ticketId }, 'Fetching Zendesk ticket');

  const response = await axios.get(`${zendeskApiUrl}/tickets/${options.ticketId}.json`, {
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  const ticket = response.data.ticket;

  const result: TicketWithComments = {
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    requesterId: ticket.requester_id,
    assigneeId: ticket.assignee_id,
    groupId: ticket.group_id,
    url: ticket.url,
  };

  // Fetch comments if requested
  if (options.includeComments) {
    const commentsResponse = await axios.get(
      `${zendeskApiUrl}/tickets/${options.ticketId}/comments.json`,
      {
        headers: {
          Authorization: getAuthHeader(),
        },
      }
    );

    result.comments = commentsResponse.data.comments.map((comment: {
      id: number;
      type: string;
      body: string;
      html_body: string;
      public: boolean;
      author_id: number;
      created_at: string;
    }) => ({
      id: comment.id,
      type: comment.type,
      body: comment.body,
      htmlBody: comment.html_body,
      public: comment.public,
      authorId: comment.author_id,
      createdAt: comment.created_at,
    }));
  }

  logger.info({ ticketId: ticket.id, status: ticket.status }, 'Zendesk ticket retrieved');

  return result;
}

const getTicketWithBreaker = createCircuitBreaker(getTicketInternal, {
  timeout: 15000,
  name: 'zendesk-get-ticket',
});

const getTicketRateLimited = withRateLimit(
  async (options: GetTicketOptions) => getTicketWithBreaker.fire(options),
  zendeskRateLimiter
);

export async function getTicket(options: GetTicketOptions): Promise<TicketWithComments> {
  return await getTicketRateLimited(options) as unknown as TicketWithComments;
}

export interface SearchTicketsOptions {
  query: string; // Zendesk search query syntax
  sortBy?: 'created_at' | 'updated_at' | 'priority' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResults {
  tickets: Ticket[];
  count: number;
  nextPage: string | null;
  previousPage: string | null;
}

/**
 * Search tickets with query
 */
async function searchTicketsInternal(options: SearchTicketsOptions): Promise<SearchResults> {
  if (!zendeskApiUrl) {
    throw new Error('Zendesk not configured. Set ZENDESK_SUBDOMAIN.');
  }

  logger.info({ query: options.query }, 'Searching Zendesk tickets');

  const params = new URLSearchParams({
    query: options.query,
  });

  if (options.sortBy) {
    params.append('sort_by', options.sortBy);
  }
  if (options.sortOrder) {
    params.append('sort_order', options.sortOrder);
  }

  const response = await axios.get(`${zendeskApiUrl}/search.json?${params.toString()}`, {
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  logger.info({ count: response.data.count }, 'Zendesk tickets found');

  return {
    tickets: response.data.results.map((ticket: {
      id: number;
      subject: string;
      description: string;
      status: string;
      priority: string;
      type: string;
      tags: string[];
      created_at: string;
      updated_at: string;
      requester_id: number;
      assignee_id: number;
      group_id: number;
      url: string;
    }) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      tags: ticket.tags,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      requesterId: ticket.requester_id,
      assigneeId: ticket.assignee_id,
      groupId: ticket.group_id,
      url: ticket.url,
    })),
    count: response.data.count,
    nextPage: response.data.next_page,
    previousPage: response.data.previous_page,
  };
}

const searchTicketsWithBreaker = createCircuitBreaker(searchTicketsInternal, {
  timeout: 15000,
  name: 'zendesk-search-tickets',
});

const searchTicketsRateLimited = withRateLimit(
  async (options: SearchTicketsOptions) => searchTicketsWithBreaker.fire(options),
  zendeskRateLimiter
);

export async function searchTickets(options: SearchTicketsOptions): Promise<SearchResults> {
  return await searchTicketsRateLimited(options) as unknown as SearchResults;
}

export interface ListTicketsOptions {
  status?: string;
  sortBy?: 'created_at' | 'updated_at' | 'priority';
  sortOrder?: 'asc' | 'desc';
  perPage?: number;
}

/**
 * List tickets with filters
 */
async function listTicketsInternal(options: ListTicketsOptions = {}): Promise<Ticket[]> {
  if (!zendeskApiUrl) {
    throw new Error('Zendesk not configured. Set ZENDESK_SUBDOMAIN.');
  }

  logger.info(options, 'Listing Zendesk tickets');

  const params = new URLSearchParams();

  if (options.sortBy) {
    params.append('sort_by', options.sortBy);
  }
  if (options.sortOrder) {
    params.append('sort_order', options.sortOrder);
  }
  if (options.perPage) {
    params.append('per_page', options.perPage.toString());
  }

  const response = await axios.get(`${zendeskApiUrl}/tickets.json?${params.toString()}`, {
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  logger.info({ count: response.data.tickets.length }, 'Zendesk tickets retrieved');

  return response.data.tickets.map((ticket: {
    id: number;
    subject: string;
    description: string;
    status: string;
    priority: string;
    type: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    requester_id: number;
    assignee_id: number;
    group_id: number;
    url: string;
  }) => ({
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    requesterId: ticket.requester_id,
    assigneeId: ticket.assignee_id,
    groupId: ticket.group_id,
    url: ticket.url,
  }));
}

const listTicketsWithBreaker = createCircuitBreaker(listTicketsInternal, {
  timeout: 15000,
  name: 'zendesk-list-tickets',
});

const listTicketsRateLimited = withRateLimit(
  async (options: ListTicketsOptions) => listTicketsWithBreaker.fire(options),
  zendeskRateLimiter
);

export async function listTickets(options: ListTicketsOptions = {}): Promise<Ticket[]> {
  return await listTicketsRateLimited(options) as unknown as Ticket[];
}

export interface CreateUserOptions {
  name: string;
  email: string;
  role?: 'end-user' | 'agent' | 'admin';
  verified?: boolean;
  phone?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create or update a user
 */
async function createUserInternal(options: CreateUserOptions): Promise<User> {
  if (!zendeskApiUrl) {
    throw new Error('Zendesk not configured. Set ZENDESK_SUBDOMAIN.');
  }

  logger.info({ name: options.name, email: options.email }, 'Creating Zendesk user');

  const response = await axios.post(
    `${zendeskApiUrl}/users.json`,
    {
      user: {
        name: options.name,
        email: options.email,
        role: options.role || 'end-user',
        verified: options.verified || false,
        phone: options.phone,
      },
    },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const user = response.data.user;

  logger.info({ userId: user.id, email: user.email }, 'Zendesk user created');

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verified: user.verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

const createUserWithBreaker = createCircuitBreaker(createUserInternal, {
  timeout: 10000,
  name: 'zendesk-create-user',
});

const createUserRateLimited = withRateLimit(
  async (options: CreateUserOptions) => createUserWithBreaker.fire(options),
  zendeskRateLimiter
);

export async function createUser(options: CreateUserOptions): Promise<User> {
  return await createUserRateLimited(options) as unknown as User;
}

import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Freshdesk Module
 *
 * Help desk and customer support platform
 * - Create support tickets
 * - Update ticket status
 * - Add notes and replies
 * - Get ticket details
 * - Search tickets
 * - Manage contacts
 * - Get ticket statistics
 * - Built-in resilience
 *
 * Perfect for:
 * - Customer support automation
 * - Ticket management
 * - Support workflows
 * - Customer communication
 * - Help desk operations
 */

const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY;

if (!FRESHDESK_DOMAIN || !FRESHDESK_API_KEY) {
  logger.warn('⚠️  FRESHDESK_DOMAIN or FRESHDESK_API_KEY not set. Freshdesk features will not work.');
}

const freshdeskApiUrl = FRESHDESK_DOMAIN ? `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2` : '';

// Rate limiter: Freshdesk has rate limits based on plan
const freshdeskRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // 100ms between requests
  reservoir: 500,
  reservoirRefreshAmount: 500,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'freshdesk',
});

// Helper to create auth header
function getAuthHeader(): string {
  if (!FRESHDESK_API_KEY) {
    throw new Error('Freshdesk API key not set');
  }
  return `Basic ${Buffer.from(`${FRESHDESK_API_KEY}:X`).toString('base64')}`;
}

export interface CreateTicketOptions {
  name?: string; // Requester name
  email: string; // Requester email
  subject: string;
  description: string;
  status?: 2 | 3 | 4 | 5 | 6 | 7; // 2=Open, 3=Pending, 4=Resolved, 5=Closed, 6=Waiting on Customer, 7=Waiting on Third Party
  priority?: 1 | 2 | 3 | 4; // 1=Low, 2=Medium, 3=High, 4=Urgent
  source?: 1 | 2 | 3 | 7 | 8 | 9 | 10; // 1=Email, 2=Portal, 3=Phone, 7=Chat, 8=Feedback Widget, 9=Outbound Email, 10=Ecommerce
  type?: string;
  tags?: string[];
  ccEmails?: string[];
  groupId?: number;
  responderId?: number;
  productId?: number;
  customFields?: Record<string, string | number | boolean>;
}

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  descriptionText: string;
  status: number;
  priority: number;
  source: number;
  type: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueBy: string;
  frDueBy: string;
  isEscalated: boolean;
  requesterId: number;
  responderId: number | null;
  groupId: number | null;
}

/**
 * Create a new support ticket
 */
async function createTicketInternal(options: CreateTicketOptions): Promise<Ticket> {
  if (!freshdeskApiUrl) {
    throw new Error('Freshdesk not configured. Set FRESHDESK_DOMAIN.');
  }

  logger.info(
    {
      subject: options.subject,
      email: options.email,
      priority: options.priority,
    },
    'Creating Freshdesk ticket'
  );

  const ticketData: Record<string, unknown> = {
    email: options.email,
    subject: options.subject,
    description: options.description,
    status: options.status || 2, // Default to Open
    priority: options.priority || 1, // Default to Low
    source: options.source || 2, // Default to Portal
  };

  if (options.name) ticketData.name = options.name;
  if (options.type) ticketData.type = options.type;
  if (options.tags) ticketData.tags = options.tags;
  if (options.ccEmails) ticketData.cc_emails = options.ccEmails;
  if (options.groupId) ticketData.group_id = options.groupId;
  if (options.responderId) ticketData.responder_id = options.responderId;
  if (options.productId) ticketData.product_id = options.productId;
  if (options.customFields) ticketData.custom_fields = options.customFields;

  const response = await axios.post(`${freshdeskApiUrl}/tickets`, ticketData, {
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
  });

  const ticket = response.data;

  logger.info({ ticketId: ticket.id, status: ticket.status }, 'Freshdesk ticket created');

  return {
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    descriptionText: ticket.description_text,
    status: ticket.status,
    priority: ticket.priority,
    source: ticket.source,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    dueBy: ticket.due_by,
    frDueBy: ticket.fr_due_by,
    isEscalated: ticket.is_escalated,
    requesterId: ticket.requester_id,
    responderId: ticket.responder_id,
    groupId: ticket.group_id,
  };
}

const createTicketWithBreaker = createCircuitBreaker(createTicketInternal, {
  timeout: 15000,
  name: 'freshdesk-create-ticket',
});

const createTicketRateLimited = withRateLimit(
  async (options: CreateTicketOptions) => createTicketWithBreaker.fire(options),
  freshdeskRateLimiter
);

export async function createTicket(options: CreateTicketOptions): Promise<Ticket> {
  return await createTicketRateLimited(options) as unknown as Ticket;
}

export interface UpdateTicketOptions {
  ticketId: number;
  subject?: string;
  description?: string;
  status?: 2 | 3 | 4 | 5 | 6 | 7;
  priority?: 1 | 2 | 3 | 4;
  source?: 1 | 2 | 3 | 7 | 8 | 9 | 10;
  type?: string;
  tags?: string[];
  groupId?: number;
  responderId?: number;
  customFields?: Record<string, string | number | boolean>;
}

/**
 * Update an existing ticket
 */
async function updateTicketInternal(options: UpdateTicketOptions): Promise<Ticket> {
  if (!freshdeskApiUrl) {
    throw new Error('Freshdesk not configured. Set FRESHDESK_DOMAIN.');
  }

  logger.info({ ticketId: options.ticketId }, 'Updating Freshdesk ticket');

  const updateData: Record<string, unknown> = {};

  if (options.subject) updateData.subject = options.subject;
  if (options.description) updateData.description = options.description;
  if (options.status) updateData.status = options.status;
  if (options.priority) updateData.priority = options.priority;
  if (options.source) updateData.source = options.source;
  if (options.type) updateData.type = options.type;
  if (options.tags) updateData.tags = options.tags;
  if (options.groupId) updateData.group_id = options.groupId;
  if (options.responderId) updateData.responder_id = options.responderId;
  if (options.customFields) updateData.custom_fields = options.customFields;

  const response = await axios.put(
    `${freshdeskApiUrl}/tickets/${options.ticketId}`,
    updateData,
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const ticket = response.data;

  logger.info({ ticketId: ticket.id, status: ticket.status }, 'Freshdesk ticket updated');

  return {
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    descriptionText: ticket.description_text,
    status: ticket.status,
    priority: ticket.priority,
    source: ticket.source,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    dueBy: ticket.due_by,
    frDueBy: ticket.fr_due_by,
    isEscalated: ticket.is_escalated,
    requesterId: ticket.requester_id,
    responderId: ticket.responder_id,
    groupId: ticket.group_id,
  };
}

const updateTicketWithBreaker = createCircuitBreaker(updateTicketInternal, {
  timeout: 15000,
  name: 'freshdesk-update-ticket',
});

const updateTicketRateLimited = withRateLimit(
  async (options: UpdateTicketOptions) => updateTicketWithBreaker.fire(options),
  freshdeskRateLimiter
);

export async function updateTicket(options: UpdateTicketOptions): Promise<Ticket> {
  return await updateTicketRateLimited(options) as unknown as Ticket;
}

export interface AddNoteOptions {
  ticketId: number;
  body: string;
  private?: boolean; // Private note (not visible to requester)
  notifyEmails?: string[];
  userId?: number; // User ID posting the note
}

export interface Note {
  id: number;
  body: string;
  bodyText: string;
  private: boolean;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Add a note to a ticket (internal or public)
 */
async function addNoteInternal(options: AddNoteOptions): Promise<Note> {
  if (!freshdeskApiUrl) {
    throw new Error('Freshdesk not configured. Set FRESHDESK_DOMAIN.');
  }

  logger.info(
    {
      ticketId: options.ticketId,
      isPrivate: options.private !== false,
      bodyLength: options.body.length,
    },
    'Adding note to Freshdesk ticket'
  );

  const noteData: Record<string, unknown> = {
    body: options.body,
    private: options.private !== false, // Default to private
  };

  if (options.notifyEmails) {
    noteData.notify_emails = options.notifyEmails;
  }
  if (options.userId) {
    noteData.user_id = options.userId;
  }

  const response = await axios.post(
    `${freshdeskApiUrl}/tickets/${options.ticketId}/notes`,
    noteData,
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const note = response.data;

  logger.info({ noteId: note.id, ticketId: options.ticketId }, 'Note added to Freshdesk ticket');

  return {
    id: note.id,
    body: note.body,
    bodyText: note.body_text,
    private: note.private,
    userId: note.user_id,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };
}

const addNoteWithBreaker = createCircuitBreaker(addNoteInternal, {
  timeout: 15000,
  name: 'freshdesk-add-note',
});

const addNoteRateLimited = withRateLimit(
  async (options: AddNoteOptions) => addNoteWithBreaker.fire(options),
  freshdeskRateLimiter
);

export async function addNote(options: AddNoteOptions): Promise<Note> {
  return await addNoteRateLimited(options) as unknown as Note;
}

export interface AddReplyOptions {
  ticketId: number;
  body: string;
  fromEmail?: string;
  userId?: number;
  ccEmails?: string[];
  bccEmails?: string[];
}

export interface Reply {
  id: number;
  body: string;
  bodyText: string;
  userId: number;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Add a public reply to a ticket (visible to requester)
 */
async function addReplyInternal(options: AddReplyOptions): Promise<Reply> {
  if (!freshdeskApiUrl) {
    throw new Error('Freshdesk not configured. Set FRESHDESK_DOMAIN.');
  }

  logger.info(
    {
      ticketId: options.ticketId,
      bodyLength: options.body.length,
    },
    'Adding reply to Freshdesk ticket'
  );

  const replyData: Record<string, unknown> = {
    body: options.body,
  };

  if (options.fromEmail) replyData.from_email = options.fromEmail;
  if (options.userId) replyData.user_id = options.userId;
  if (options.ccEmails) replyData.cc_emails = options.ccEmails;
  if (options.bccEmails) replyData.bcc_emails = options.bccEmails;

  const response = await axios.post(
    `${freshdeskApiUrl}/tickets/${options.ticketId}/reply`,
    replyData,
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const reply = response.data;

  logger.info({ replyId: reply.id, ticketId: options.ticketId }, 'Reply added to Freshdesk ticket');

  return {
    id: reply.id,
    body: reply.body,
    bodyText: reply.body_text,
    userId: reply.user_id,
    fromEmail: reply.from_email,
    toEmails: reply.to_emails,
    ccEmails: reply.cc_emails,
    bccEmails: reply.bcc_emails,
    createdAt: reply.created_at,
    updatedAt: reply.updated_at,
  };
}

const addReplyWithBreaker = createCircuitBreaker(addReplyInternal, {
  timeout: 15000,
  name: 'freshdesk-add-reply',
});

const addReplyRateLimited = withRateLimit(
  async (options: AddReplyOptions) => addReplyWithBreaker.fire(options),
  freshdeskRateLimiter
);

export async function addReply(options: AddReplyOptions): Promise<Reply> {
  return await addReplyRateLimited(options) as unknown as Reply;
}

export interface GetTicketOptions {
  ticketId: number;
  includeConversations?: boolean;
}

export interface Conversation {
  id: number;
  body: string;
  bodyText: string;
  incoming: boolean;
  private: boolean;
  userId: number;
  createdAt: string;
}

export interface TicketWithConversations extends Ticket {
  conversations?: Conversation[];
}

/**
 * Get ticket details
 */
async function getTicketInternal(options: GetTicketOptions): Promise<TicketWithConversations> {
  if (!freshdeskApiUrl) {
    throw new Error('Freshdesk not configured. Set FRESHDESK_DOMAIN.');
  }

  logger.info({ ticketId: options.ticketId }, 'Fetching Freshdesk ticket');

  const response = await axios.get(`${freshdeskApiUrl}/tickets/${options.ticketId}`, {
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  const ticket = response.data;

  const result: TicketWithConversations = {
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    descriptionText: ticket.description_text,
    status: ticket.status,
    priority: ticket.priority,
    source: ticket.source,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    dueBy: ticket.due_by,
    frDueBy: ticket.fr_due_by,
    isEscalated: ticket.is_escalated,
    requesterId: ticket.requester_id,
    responderId: ticket.responder_id,
    groupId: ticket.group_id,
  };

  // Fetch conversations if requested
  if (options.includeConversations) {
    const conversationsResponse = await axios.get(
      `${freshdeskApiUrl}/tickets/${options.ticketId}/conversations`,
      {
        headers: {
          Authorization: getAuthHeader(),
        },
      }
    );

    result.conversations = conversationsResponse.data.map((conv: {
      id: number;
      body: string;
      body_text: string;
      incoming: boolean;
      private: boolean;
      user_id: number;
      created_at: string;
    }) => ({
      id: conv.id,
      body: conv.body,
      bodyText: conv.body_text,
      incoming: conv.incoming,
      private: conv.private,
      userId: conv.user_id,
      createdAt: conv.created_at,
    }));
  }

  logger.info({ ticketId: ticket.id, status: ticket.status }, 'Freshdesk ticket retrieved');

  return result;
}

const getTicketWithBreaker = createCircuitBreaker(getTicketInternal, {
  timeout: 15000,
  name: 'freshdesk-get-ticket',
});

const getTicketRateLimited = withRateLimit(
  async (options: GetTicketOptions) => getTicketWithBreaker.fire(options),
  freshdeskRateLimiter
);

export async function getTicket(options: GetTicketOptions): Promise<TicketWithConversations> {
  return await getTicketRateLimited(options) as unknown as TicketWithConversations;
}

export interface ListTicketsOptions {
  filter?: 'new_and_my_open' | 'watching' | 'spam' | 'deleted';
  page?: number;
  perPage?: number;
  orderBy?: 'created_at' | 'updated_at' | 'due_by';
  orderType?: 'asc' | 'desc';
}

/**
 * List tickets with filters
 */
async function listTicketsInternal(options: ListTicketsOptions = {}): Promise<Ticket[]> {
  if (!freshdeskApiUrl) {
    throw new Error('Freshdesk not configured. Set FRESHDESK_DOMAIN.');
  }

  logger.info(options, 'Listing Freshdesk tickets');

  const params = new URLSearchParams();

  if (options.filter) params.append('filter', options.filter);
  if (options.page) params.append('page', options.page.toString());
  if (options.perPage) params.append('per_page', options.perPage.toString());
  if (options.orderBy) params.append('order_by', options.orderBy);
  if (options.orderType) params.append('order_type', options.orderType);

  const response = await axios.get(`${freshdeskApiUrl}/tickets?${params.toString()}`, {
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  logger.info({ count: response.data.length }, 'Freshdesk tickets retrieved');

  return response.data.map((ticket: {
    id: number;
    subject: string;
    description: string;
    description_text: string;
    status: number;
    priority: number;
    source: number;
    type: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
    due_by: string;
    fr_due_by: string;
    is_escalated: boolean;
    requester_id: number;
    responder_id: number | null;
    group_id: number | null;
  }) => ({
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    descriptionText: ticket.description_text,
    status: ticket.status,
    priority: ticket.priority,
    source: ticket.source,
    type: ticket.type,
    tags: ticket.tags,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    dueBy: ticket.due_by,
    frDueBy: ticket.fr_due_by,
    isEscalated: ticket.is_escalated,
    requesterId: ticket.requester_id,
    responderId: ticket.responder_id,
    groupId: ticket.group_id,
  }));
}

const listTicketsWithBreaker = createCircuitBreaker(listTicketsInternal, {
  timeout: 15000,
  name: 'freshdesk-list-tickets',
});

const listTicketsRateLimited = withRateLimit(
  async (options: ListTicketsOptions) => listTicketsWithBreaker.fire(options),
  freshdeskRateLimiter
);

export async function listTickets(options: ListTicketsOptions = {}): Promise<Ticket[]> {
  return await listTicketsRateLimited(options) as unknown as Ticket[];
}

export interface CreateContactOptions {
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  description?: string;
  tags?: string[];
  customFields?: Record<string, string | number | boolean>;
}

export interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  description: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a contact
 */
async function createContactInternal(options: CreateContactOptions): Promise<Contact> {
  if (!freshdeskApiUrl) {
    throw new Error('Freshdesk not configured. Set FRESHDESK_DOMAIN.');
  }

  logger.info({ name: options.name, email: options.email }, 'Creating Freshdesk contact');

  const response = await axios.post(
    `${freshdeskApiUrl}/contacts`,
    {
      name: options.name,
      email: options.email,
      phone: options.phone,
      mobile: options.mobile,
      address: options.address,
      description: options.description,
      tags: options.tags,
      custom_fields: options.customFields,
    },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );

  const contact = response.data;

  logger.info({ contactId: contact.id, email: contact.email }, 'Freshdesk contact created');

  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    mobile: contact.mobile,
    address: contact.address,
    description: contact.description,
    tags: contact.tags,
    createdAt: contact.created_at,
    updatedAt: contact.updated_at,
  };
}

const createContactWithBreaker = createCircuitBreaker(createContactInternal, {
  timeout: 10000,
  name: 'freshdesk-create-contact',
});

const createContactRateLimited = withRateLimit(
  async (options: CreateContactOptions) => createContactWithBreaker.fire(options),
  freshdeskRateLimiter
);

export async function createContact(options: CreateContactOptions): Promise<Contact> {
  return await createContactRateLimited(options) as unknown as Contact;
}

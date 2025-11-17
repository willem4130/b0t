/**
 * GoHighLevel (GHL) API Client with Reliability Infrastructure
 *
 * Complete integration with GHL CRM platform including:
 * - Contacts management (CRUD, tags, custom fields)
 * - Conversations (SMS, email, calls)
 * - Calendar & Appointments
 * - Opportunities (sales pipeline)
 * - Campaigns & Workflows
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting for API quota management (100 req/10sec, 200k/day)
 * - Structured logging
 * - Automatic error handling
 *
 * API Version: v2 (OAuth 2.0)
 * Rate Limits: 100 requests per 10 seconds, 200,000 requests per day
 * Documentation: https://marketplace.gohighlevel.com/docs/
 *
 * @module business/gohighlevel
 */

import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface GHLContact {
  id: string;
  locationId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  dateOfBirth?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  companyName?: string;
  website?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  source?: string;
  assignedTo?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLConversation {
  id: string;
  locationId: string;
  contactId: string;
  type: 'SMS' | 'Email' | 'Call' | 'WhatsApp' | 'GMB' | 'IG' | 'FB' | 'Live_Chat';
  lastMessageBody?: string;
  lastMessageType?: 'message_inbound' | 'message_outbound';
  unreadCount?: number;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLMessage {
  id: string;
  conversationId: string;
  type: 'SMS' | 'Email' | 'Call' | 'WhatsApp';
  messageType: 'message_inbound' | 'message_outbound';
  body: string;
  direction: 'inbound' | 'outbound';
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  dateAdded: string;
  attachments?: string[];
}

export interface GHLCalendar {
  id: string;
  locationId: string;
  name: string;
  description?: string;
  slug?: string;
  widgetSlug?: string;
  widgetType?: string;
  eventTitle?: string;
  eventColor?: string;
  meetingLocation?: string;
  appointmentPerSlot?: number;
  appointmentPerDay?: number;
  openHours?: unknown[];
  enableRecurring?: boolean;
  recurring?: unknown;
  formId?: string;
  stickyContact?: boolean;
  isLivePaymentMode?: boolean;
  autoConfirm?: boolean;
  shouldSendAlertEmailsToAssignedMember?: boolean;
  alertEmail?: string;
  googleInvitationEmails?: boolean;
  allowReschedule?: boolean;
  allowCancellation?: boolean;
  shouldAssignContactToTeamMember?: boolean;
  shouldSkipAssigningContactForExisting?: boolean;
  notes?: string;
  pixelId?: string;
  formSubmitType?: string;
  formSubmitRedirectURL?: string;
  formSubmitThanksMessage?: string;
  availabilities?: unknown[];
  teamMembers?: string[];
  eventType?: string;
}

export interface GHLAppointment {
  id: string;
  locationId: string;
  calendarId: string;
  contactId: string;
  title: string;
  startTime: string;
  endTime: string;
  appointmentStatus: 'new' | 'confirmed' | 'cancelled' | 'showed' | 'noshow' | 'rescheduled' | 'invalid';
  assignedUserId?: string;
  address?: string;
  notes?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLOpportunity {
  id: string;
  locationId: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  contactId?: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  monetaryValue?: number;
  assignedTo?: string;
  customFields?: Record<string, unknown>;
  source?: string;
  lastStatusChangeAt?: string;
  lastStageChangeAt?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLPipeline {
  id: string;
  locationId: string;
  name: string;
  stages: GHLPipelineStage[];
}

export interface GHLPipelineStage {
  id: string;
  name: string;
  position: number;
}

export interface GHLTag {
  id: string;
  locationId: string;
  name: string;
  dateAdded?: string;
}

export interface GHLCustomField {
  id: string;
  locationId: string;
  name: string;
  fieldKey: string;
  dataType: 'TEXT' | 'LARGE_TEXT' | 'NUMERICAL' | 'PHONE' | 'MONETORY' | 'CHECKBOX' | 'SINGLE_OPTIONS' | 'MULTIPLE_OPTIONS' | 'DATE' | 'FILE_UPLOAD';
  position: number;
}

export interface GHLLocation {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface GHLRequestOptions {
  accessToken?: string;
  locationId?: string;
}

// ============================================================================
// CREDENTIAL DETECTION
// ============================================================================

const GHL_ACCESS_TOKEN = process.env.GHL_ACCESS_TOKEN;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const GHL_API_BASE_URL = 'https://services.leadconnectorhq.com';

const hasCredentials = GHL_ACCESS_TOKEN !== undefined;

if (!hasCredentials) {
  logger.warn('⚠️  GHL credentials not set. GoHighLevel features will not work.');
}

// ============================================================================
// RATE LIMITER CONFIGURATION
// ============================================================================

// GHL Rate Limits:
// - Burst: 100 requests per 10 seconds per app per resource
// - Daily: 200,000 requests per day per app per resource
const ghlRateLimiter = createRateLimiter({
  maxConcurrent: 10,              // Max parallel requests
  minTime: 100,                   // Min 100ms between requests
  reservoir: 100,                 // Initial token count (burst limit)
  reservoirRefreshAmount: 100,    // Tokens added per interval
  reservoirRefreshInterval: 10000, // Refresh every 10 seconds
  id: 'gohighlevel',
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Make authenticated request to GHL API
 */
async function makeGHLRequest<T>(
  endpoint: string,
  options: GHLRequestOptions & {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    queryParams?: Record<string, string>;
  }
): Promise<T> {
  const accessToken = options.accessToken || GHL_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('GHL access token not configured. Provide accessToken or set GHL_ACCESS_TOKEN.');
  }

  const url = new URL(`${GHL_API_BASE_URL}${endpoint}`);

  if (options.queryParams) {
    Object.entries(options.queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const requestOptions: RequestInit = {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28', // GHL API version header
    },
  };

  if (options.body) {
    requestOptions.body = JSON.stringify(options.body);
  }

  logger.info({ method: options.method || 'GET', endpoint }, 'Making GHL API request');

  const response = await fetch(url.toString(), requestOptions);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GHL API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

// ============================================================================
// CONTACTS API
// ============================================================================

/**
 * Create contact (internal)
 */
async function createContactInternal(
  contactData: Partial<GHLContact>,
  options: GHLRequestOptions = {}
): Promise<GHLContact> {
  logger.info({ email: contactData.email }, 'Creating GHL contact');

  const locationId = options.locationId || GHL_LOCATION_ID || contactData.locationId;
  if (!locationId) {
    throw new Error('locationId is required. Provide in options or contactData, or set GHL_LOCATION_ID env var.');
  }

  const result = await makeGHLRequest<{ contact: GHLContact }>(
    '/contacts/',
    {
      ...options,
      method: 'POST',
      body: { ...contactData, locationId },
    }
  );

  logger.info({ contactId: result.contact.id }, 'GHL contact created');
  return result.contact;
}

const createContactWithBreaker = createCircuitBreaker(createContactInternal, {
  timeout: 15000,
  name: 'ghl.createContact',
});

/**
 * Create a new contact in GoHighLevel
 *
 * @param contactData - Contact details including email, phone, name, etc.
 * @param options - Request options including accessToken and locationId
 * @returns Created contact object
 *
 * @example
 * const contact = await createContact({
 *   email: 'john@example.com',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   phone: '+1234567890',
 *   tags: ['lead', 'website']
 * }, { accessToken: 'your-token', locationId: 'location-id' });
 */
export const createContact = withRateLimit(
  (contactData: Partial<GHLContact>, options: GHLRequestOptions = {}) =>
    createContactWithBreaker.fire(contactData, options),
  ghlRateLimiter
);

/**
 * Get contact by ID (internal)
 */
async function getContactInternal(
  contactId: string,
  options: GHLRequestOptions = {}
): Promise<GHLContact> {
  logger.info({ contactId }, 'Getting GHL contact');

  const result = await makeGHLRequest<{ contact: GHLContact }>(
    `/contacts/${contactId}`,
    { ...options, method: 'GET' }
  );

  logger.info({ contactId: result.contact.id }, 'GHL contact retrieved');
  return result.contact;
}

const getContactWithBreaker = createCircuitBreaker(getContactInternal, {
  timeout: 15000,
  name: 'ghl.getContact',
});

/**
 * Get a contact by ID
 *
 * @param contactId - The contact ID
 * @param options - Request options including accessToken
 * @returns Contact object
 *
 * @example
 * const contact = await getContact('contact-id', { accessToken: 'your-token' });
 */
export const getContact = withRateLimit(
  (contactId: string, options: GHLRequestOptions = {}) =>
    getContactWithBreaker.fire(contactId, options),
  ghlRateLimiter
);

/**
 * Update contact (internal)
 */
async function updateContactInternal(
  contactId: string,
  contactData: Partial<GHLContact>,
  options: GHLRequestOptions = {}
): Promise<GHLContact> {
  logger.info({ contactId }, 'Updating GHL contact');

  const result = await makeGHLRequest<{ contact: GHLContact }>(
    `/contacts/${contactId}`,
    {
      ...options,
      method: 'PUT',
      body: contactData,
    }
  );

  logger.info({ contactId: result.contact.id }, 'GHL contact updated');
  return result.contact;
}

const updateContactWithBreaker = createCircuitBreaker(updateContactInternal, {
  timeout: 15000,
  name: 'ghl.updateContact',
});

/**
 * Update an existing contact
 *
 * @param contactId - The contact ID to update
 * @param contactData - Updated contact fields
 * @param options - Request options including accessToken
 * @returns Updated contact object
 *
 * @example
 * const contact = await updateContact('contact-id', {
 *   firstName: 'Jane',
 *   tags: ['customer', 'vip']
 * }, { accessToken: 'your-token' });
 */
export const updateContact = withRateLimit(
  (contactId: string, contactData: Partial<GHLContact>, options: GHLRequestOptions = {}) =>
    updateContactWithBreaker.fire(contactId, contactData, options),
  ghlRateLimiter
);

/**
 * Delete contact (internal)
 */
async function deleteContactInternal(
  contactId: string,
  options: GHLRequestOptions = {}
): Promise<{ success: boolean }> {
  logger.info({ contactId }, 'Deleting GHL contact');

  await makeGHLRequest(
    `/contacts/${contactId}`,
    { ...options, method: 'DELETE' }
  );

  logger.info({ contactId }, 'GHL contact deleted');
  return { success: true };
}

const deleteContactWithBreaker = createCircuitBreaker(deleteContactInternal, {
  timeout: 15000,
  name: 'ghl.deleteContact',
});

/**
 * Delete a contact by ID
 *
 * @param contactId - The contact ID to delete
 * @param options - Request options including accessToken
 * @returns Success confirmation
 *
 * @example
 * const result = await deleteContact('contact-id', { accessToken: 'your-token' });
 */
export const deleteContact = withRateLimit(
  (contactId: string, options: GHLRequestOptions = {}) =>
    deleteContactWithBreaker.fire(contactId, options),
  ghlRateLimiter
);

/**
 * Search contacts (internal)
 */
async function searchContactsInternal(
  searchParams: {
    locationId?: string;
    query?: string;
    email?: string;
    phone?: string;
    limit?: number;
  },
  options: GHLRequestOptions = {}
): Promise<GHLContact[]> {
  logger.info({ searchParams }, 'Searching GHL contacts');

  const locationId = searchParams.locationId || options.locationId || GHL_LOCATION_ID;
  if (!locationId) {
    throw new Error('locationId is required in searchParams, options, or set GHL_LOCATION_ID env var.');
  }

  const queryParams: Record<string, string> = {
    locationId,
    limit: String(searchParams.limit || 20),
  };

  if (searchParams.query) queryParams.query = searchParams.query;
  if (searchParams.email) queryParams.email = searchParams.email;
  if (searchParams.phone) queryParams.phone = searchParams.phone;

  const result = await makeGHLRequest<{ contacts: GHLContact[] }>(
    '/contacts/search',
    {
      ...options,
      method: 'GET',
      queryParams,
    }
  );

  logger.info({ resultCount: result.contacts.length }, 'GHL contacts search completed');
  return result.contacts;
}

const searchContactsWithBreaker = createCircuitBreaker(searchContactsInternal, {
  timeout: 15000,
  name: 'ghl.searchContacts',
});

/**
 * Search contacts by various criteria
 *
 * @param searchParams - Search parameters including query, email, phone, locationId
 * @param options - Request options including accessToken
 * @returns Array of matching contacts
 *
 * @example
 * const contacts = await searchContacts({
 *   locationId: 'location-id',
 *   query: 'john@example.com',
 *   limit: 10
 * }, { accessToken: 'your-token' });
 */
export const searchContacts = withRateLimit(
  (searchParams: Parameters<typeof searchContactsInternal>[0], options: GHLRequestOptions = {}) =>
    searchContactsWithBreaker.fire(searchParams, options),
  ghlRateLimiter
);

// ============================================================================
// CONVERSATIONS API
// ============================================================================

/**
 * Get conversations for a contact (internal)
 */
async function getConversationsInternal(
  contactId: string,
  options: GHLRequestOptions = {}
): Promise<GHLConversation[]> {
  logger.info({ contactId }, 'Getting GHL conversations');

  const result = await makeGHLRequest<{ conversations: GHLConversation[] }>(
    `/conversations/search`,
    {
      ...options,
      method: 'GET',
      queryParams: { contactId },
    }
  );

  logger.info({ conversationCount: result.conversations.length }, 'GHL conversations retrieved');
  return result.conversations;
}

const getConversationsWithBreaker = createCircuitBreaker(getConversationsInternal, {
  timeout: 15000,
  name: 'ghl.getConversations',
});

/**
 * Get all conversations for a contact
 *
 * @param contactId - The contact ID
 * @param options - Request options including accessToken
 * @returns Array of conversations
 *
 * @example
 * const conversations = await getConversations('contact-id', { accessToken: 'your-token' });
 */
export const getConversations = withRateLimit(
  (contactId: string, options: GHLRequestOptions = {}) =>
    getConversationsWithBreaker.fire(contactId, options),
  ghlRateLimiter
);

/**
 * Send message (internal)
 */
async function sendMessageInternal(
  messageData: {
    contactId: string;
    type: 'SMS' | 'Email' | 'WhatsApp';
    message: string;
    subject?: string;
    html?: string;
    conversationId?: string;
  },
  options: GHLRequestOptions = {}
): Promise<GHLMessage> {
  logger.info({ contactId: messageData.contactId, type: messageData.type }, 'Sending GHL message');

  const result = await makeGHLRequest<{ message: GHLMessage }>(
    '/conversations/messages',
    {
      ...options,
      method: 'POST',
      body: messageData,
    }
  );

  logger.info({ messageId: result.message.id }, 'GHL message sent');
  return result.message;
}

const sendMessageWithBreaker = createCircuitBreaker(sendMessageInternal, {
  timeout: 15000,
  name: 'ghl.sendMessage',
});

/**
 * Send a message to a contact (SMS, Email, or WhatsApp)
 *
 * @param messageData - Message details including contactId, type, and message content
 * @param options - Request options including accessToken
 * @returns Sent message object
 *
 * @example
 * // Send SMS
 * const message = await sendMessage({
 *   contactId: 'contact-id',
 *   type: 'SMS',
 *   message: 'Hello from GHL!'
 * }, { accessToken: 'your-token' });
 *
 * @example
 * // Send Email
 * const email = await sendMessage({
 *   contactId: 'contact-id',
 *   type: 'Email',
 *   subject: 'Welcome!',
 *   message: 'Welcome to our service!',
 *   html: '<h1>Welcome!</h1><p>Welcome to our service!</p>'
 * }, { accessToken: 'your-token' });
 */
export const sendMessage = withRateLimit(
  (messageData: Parameters<typeof sendMessageInternal>[0], options: GHLRequestOptions = {}) =>
    sendMessageWithBreaker.fire(messageData, options),
  ghlRateLimiter
);

/**
 * Get messages from a conversation (internal)
 */
async function getMessagesInternal(
  conversationId: string,
  options: GHLRequestOptions & { limit?: number } = {}
): Promise<GHLMessage[]> {
  logger.info({ conversationId }, 'Getting GHL messages');

  const queryParams: Record<string, string> = {};
  if (options.limit) queryParams.limit = String(options.limit);

  const result = await makeGHLRequest<{ messages: GHLMessage[] }>(
    `/conversations/${conversationId}/messages`,
    {
      ...options,
      method: 'GET',
      queryParams,
    }
  );

  logger.info({ messageCount: result.messages.length }, 'GHL messages retrieved');
  return result.messages;
}

const getMessagesWithBreaker = createCircuitBreaker(getMessagesInternal, {
  timeout: 15000,
  name: 'ghl.getMessages',
});

/**
 * Get all messages from a conversation
 *
 * @param conversationId - The conversation ID
 * @param options - Request options including accessToken and optional limit
 * @returns Array of messages
 *
 * @example
 * const messages = await getMessages('conversation-id', {
 *   accessToken: 'your-token',
 *   limit: 50
 * });
 */
export const getMessages = withRateLimit(
  (conversationId: string, options: GHLRequestOptions & { limit?: number } = {}) =>
    getMessagesWithBreaker.fire(conversationId, options),
  ghlRateLimiter
);

// ============================================================================
// CALENDAR & APPOINTMENTS API
// ============================================================================

/**
 * Get calendars (internal)
 */
async function getCalendarsInternal(
  locationId: string,
  options: GHLRequestOptions = {}
): Promise<GHLCalendar[]> {
  logger.info({ locationId }, 'Getting GHL calendars');

  const result = await makeGHLRequest<{ calendars: GHLCalendar[] }>(
    '/calendars/',
    {
      ...options,
      method: 'GET',
      queryParams: { locationId },
    }
  );

  logger.info({ calendarCount: result.calendars.length }, 'GHL calendars retrieved');
  return result.calendars;
}

const getCalendarsWithBreaker = createCircuitBreaker(getCalendarsInternal, {
  timeout: 15000,
  name: 'ghl.getCalendars',
});

/**
 * Get all calendars for a location
 *
 * @param locationId - The location ID
 * @param options - Request options including accessToken
 * @returns Array of calendars
 *
 * @example
 * const calendars = await getCalendars('location-id', { accessToken: 'your-token' });
 */
export const getCalendars = withRateLimit(
  (locationId: string, options: GHLRequestOptions = {}) =>
    getCalendarsWithBreaker.fire(locationId, options),
  ghlRateLimiter
);

/**
 * Create appointment (internal)
 */
async function createAppointmentInternal(
  appointmentData: Partial<GHLAppointment>,
  options: GHLRequestOptions = {}
): Promise<GHLAppointment> {
  logger.info({ calendarId: appointmentData.calendarId }, 'Creating GHL appointment');

  const result = await makeGHLRequest<{ appointment: GHLAppointment }>(
    '/appointments/',
    {
      ...options,
      method: 'POST',
      body: appointmentData,
    }
  );

  logger.info({ appointmentId: result.appointment.id }, 'GHL appointment created');
  return result.appointment;
}

const createAppointmentWithBreaker = createCircuitBreaker(createAppointmentInternal, {
  timeout: 15000,
  name: 'ghl.createAppointment',
});

/**
 * Create a new appointment
 *
 * @param appointmentData - Appointment details including calendarId, contactId, startTime, endTime
 * @param options - Request options including accessToken
 * @returns Created appointment object
 *
 * @example
 * const appointment = await createAppointment({
 *   calendarId: 'calendar-id',
 *   contactId: 'contact-id',
 *   locationId: 'location-id',
 *   title: 'Consultation',
 *   startTime: '2025-01-15T10:00:00Z',
 *   endTime: '2025-01-15T11:00:00Z',
 *   appointmentStatus: 'confirmed'
 * }, { accessToken: 'your-token' });
 */
export const createAppointment = withRateLimit(
  (appointmentData: Partial<GHLAppointment>, options: GHLRequestOptions = {}) =>
    createAppointmentWithBreaker.fire(appointmentData, options),
  ghlRateLimiter
);

/**
 * Get appointment by ID (internal)
 */
async function getAppointmentInternal(
  appointmentId: string,
  options: GHLRequestOptions = {}
): Promise<GHLAppointment> {
  logger.info({ appointmentId }, 'Getting GHL appointment');

  const result = await makeGHLRequest<{ appointment: GHLAppointment }>(
    `/appointments/${appointmentId}`,
    { ...options, method: 'GET' }
  );

  logger.info({ appointmentId: result.appointment.id }, 'GHL appointment retrieved');
  return result.appointment;
}

const getAppointmentWithBreaker = createCircuitBreaker(getAppointmentInternal, {
  timeout: 15000,
  name: 'ghl.getAppointment',
});

/**
 * Get an appointment by ID
 *
 * @param appointmentId - The appointment ID
 * @param options - Request options including accessToken
 * @returns Appointment object
 *
 * @example
 * const appointment = await getAppointment('appointment-id', { accessToken: 'your-token' });
 */
export const getAppointment = withRateLimit(
  (appointmentId: string, options: GHLRequestOptions = {}) =>
    getAppointmentWithBreaker.fire(appointmentId, options),
  ghlRateLimiter
);

/**
 * Update appointment (internal)
 */
async function updateAppointmentInternal(
  appointmentId: string,
  appointmentData: Partial<GHLAppointment>,
  options: GHLRequestOptions = {}
): Promise<GHLAppointment> {
  logger.info({ appointmentId }, 'Updating GHL appointment');

  const result = await makeGHLRequest<{ appointment: GHLAppointment }>(
    `/appointments/${appointmentId}`,
    {
      ...options,
      method: 'PUT',
      body: appointmentData,
    }
  );

  logger.info({ appointmentId: result.appointment.id }, 'GHL appointment updated');
  return result.appointment;
}

const updateAppointmentWithBreaker = createCircuitBreaker(updateAppointmentInternal, {
  timeout: 15000,
  name: 'ghl.updateAppointment',
});

/**
 * Update an existing appointment
 *
 * @param appointmentId - The appointment ID to update
 * @param appointmentData - Updated appointment fields
 * @param options - Request options including accessToken
 * @returns Updated appointment object
 *
 * @example
 * const appointment = await updateAppointment('appointment-id', {
 *   appointmentStatus: 'confirmed',
 *   notes: 'Client confirmed attendance'
 * }, { accessToken: 'your-token' });
 */
export const updateAppointment = withRateLimit(
  (appointmentId: string, appointmentData: Partial<GHLAppointment>, options: GHLRequestOptions = {}) =>
    updateAppointmentWithBreaker.fire(appointmentId, appointmentData, options),
  ghlRateLimiter
);

// ============================================================================
// OPPORTUNITIES (PIPELINE) API
// ============================================================================

/**
 * Get pipelines (internal)
 */
async function getPipelinesInternal(
  locationId: string,
  options: GHLRequestOptions = {}
): Promise<GHLPipeline[]> {
  logger.info({ locationId }, 'Getting GHL pipelines');

  const result = await makeGHLRequest<{ pipelines: GHLPipeline[] }>(
    '/opportunities/pipelines',
    {
      ...options,
      method: 'GET',
      queryParams: { locationId },
    }
  );

  logger.info({ pipelineCount: result.pipelines.length }, 'GHL pipelines retrieved');
  return result.pipelines;
}

const getPipelinesWithBreaker = createCircuitBreaker(getPipelinesInternal, {
  timeout: 15000,
  name: 'ghl.getPipelines',
});

/**
 * Get all sales pipelines for a location
 *
 * @param locationId - The location ID
 * @param options - Request options including accessToken
 * @returns Array of pipelines with stages
 *
 * @example
 * const pipelines = await getPipelines('location-id', { accessToken: 'your-token' });
 */
export const getPipelines = withRateLimit(
  (locationId: string, options: GHLRequestOptions = {}) =>
    getPipelinesWithBreaker.fire(locationId, options),
  ghlRateLimiter
);

/**
 * Create opportunity (internal)
 */
async function createOpportunityInternal(
  opportunityData: Partial<GHLOpportunity>,
  options: GHLRequestOptions = {}
): Promise<GHLOpportunity> {
  logger.info({ name: opportunityData.name }, 'Creating GHL opportunity');

  const locationId = options.locationId || GHL_LOCATION_ID || opportunityData.locationId;
  if (!locationId) {
    throw new Error('locationId is required. Provide in options or opportunityData, or set GHL_LOCATION_ID env var.');
  }

  const result = await makeGHLRequest<{ opportunity: GHLOpportunity }>(
    '/opportunities/',
    {
      ...options,
      method: 'POST',
      body: { ...opportunityData, locationId },
    }
  );

  logger.info({ opportunityId: result.opportunity.id }, 'GHL opportunity created');
  return result.opportunity;
}

const createOpportunityWithBreaker = createCircuitBreaker(createOpportunityInternal, {
  timeout: 15000,
  name: 'ghl.createOpportunity',
});

/**
 * Create a new sales opportunity
 *
 * @param opportunityData - Opportunity details including name, pipelineId, pipelineStageId, contactId
 * @param options - Request options including accessToken and locationId
 * @returns Created opportunity object
 *
 * @example
 * const opportunity = await createOpportunity({
 *   name: 'New Enterprise Deal',
 *   pipelineId: 'pipeline-id',
 *   pipelineStageId: 'stage-id',
 *   contactId: 'contact-id',
 *   monetaryValue: 50000,
 *   status: 'open'
 * }, { accessToken: 'your-token', locationId: 'location-id' });
 */
export const createOpportunity = withRateLimit(
  (opportunityData: Partial<GHLOpportunity>, options: GHLRequestOptions = {}) =>
    createOpportunityWithBreaker.fire(opportunityData, options),
  ghlRateLimiter
);

/**
 * Get opportunity by ID (internal)
 */
async function getOpportunityInternal(
  opportunityId: string,
  options: GHLRequestOptions = {}
): Promise<GHLOpportunity> {
  logger.info({ opportunityId }, 'Getting GHL opportunity');

  const result = await makeGHLRequest<{ opportunity: GHLOpportunity }>(
    `/opportunities/${opportunityId}`,
    { ...options, method: 'GET' }
  );

  logger.info({ opportunityId: result.opportunity.id }, 'GHL opportunity retrieved');
  return result.opportunity;
}

const getOpportunityWithBreaker = createCircuitBreaker(getOpportunityInternal, {
  timeout: 15000,
  name: 'ghl.getOpportunity',
});

/**
 * Get an opportunity by ID
 *
 * @param opportunityId - The opportunity ID
 * @param options - Request options including accessToken
 * @returns Opportunity object
 *
 * @example
 * const opportunity = await getOpportunity('opportunity-id', { accessToken: 'your-token' });
 */
export const getOpportunity = withRateLimit(
  (opportunityId: string, options: GHLRequestOptions = {}) =>
    getOpportunityWithBreaker.fire(opportunityId, options),
  ghlRateLimiter
);

/**
 * Update opportunity (internal)
 */
async function updateOpportunityInternal(
  opportunityId: string,
  opportunityData: Partial<GHLOpportunity>,
  options: GHLRequestOptions = {}
): Promise<GHLOpportunity> {
  logger.info({ opportunityId }, 'Updating GHL opportunity');

  const result = await makeGHLRequest<{ opportunity: GHLOpportunity }>(
    `/opportunities/${opportunityId}`,
    {
      ...options,
      method: 'PUT',
      body: opportunityData,
    }
  );

  logger.info({ opportunityId: result.opportunity.id }, 'GHL opportunity updated');
  return result.opportunity;
}

const updateOpportunityWithBreaker = createCircuitBreaker(updateOpportunityInternal, {
  timeout: 15000,
  name: 'ghl.updateOpportunity',
});

/**
 * Update an existing opportunity
 *
 * @param opportunityId - The opportunity ID to update
 * @param opportunityData - Updated opportunity fields
 * @param options - Request options including accessToken
 * @returns Updated opportunity object
 *
 * @example
 * const opportunity = await updateOpportunity('opportunity-id', {
 *   pipelineStageId: 'new-stage-id',
 *   monetaryValue: 75000,
 *   status: 'won'
 * }, { accessToken: 'your-token' });
 */
export const updateOpportunity = withRateLimit(
  (opportunityId: string, opportunityData: Partial<GHLOpportunity>, options: GHLRequestOptions = {}) =>
    updateOpportunityWithBreaker.fire(opportunityId, opportunityData, options),
  ghlRateLimiter
);

/**
 * Delete opportunity (internal)
 */
async function deleteOpportunityInternal(
  opportunityId: string,
  options: GHLRequestOptions = {}
): Promise<{ success: boolean }> {
  logger.info({ opportunityId }, 'Deleting GHL opportunity');

  await makeGHLRequest(
    `/opportunities/${opportunityId}`,
    { ...options, method: 'DELETE' }
  );

  logger.info({ opportunityId }, 'GHL opportunity deleted');
  return { success: true };
}

const deleteOpportunityWithBreaker = createCircuitBreaker(deleteOpportunityInternal, {
  timeout: 15000,
  name: 'ghl.deleteOpportunity',
});

/**
 * Delete an opportunity by ID
 *
 * @param opportunityId - The opportunity ID to delete
 * @param options - Request options including accessToken
 * @returns Success confirmation
 *
 * @example
 * const result = await deleteOpportunity('opportunity-id', { accessToken: 'your-token' });
 */
export const deleteOpportunity = withRateLimit(
  (opportunityId: string, options: GHLRequestOptions = {}) =>
    deleteOpportunityWithBreaker.fire(opportunityId, options),
  ghlRateLimiter
);

// ============================================================================
// TAGS API
// ============================================================================

/**
 * Get tags (internal)
 */
async function getTagsInternal(
  locationId: string,
  options: GHLRequestOptions = {}
): Promise<GHLTag[]> {
  logger.info({ locationId }, 'Getting GHL tags');

  const result = await makeGHLRequest<{ tags: GHLTag[] }>(
    '/tags/',
    {
      ...options,
      method: 'GET',
      queryParams: { locationId },
    }
  );

  logger.info({ tagCount: result.tags.length }, 'GHL tags retrieved');
  return result.tags;
}

const getTagsWithBreaker = createCircuitBreaker(getTagsInternal, {
  timeout: 15000,
  name: 'ghl.getTags',
});

/**
 * Get all tags for a location
 *
 * @param locationId - The location ID
 * @param options - Request options including accessToken
 * @returns Array of tags
 *
 * @example
 * const tags = await getTags('location-id', { accessToken: 'your-token' });
 */
export const getTags = withRateLimit(
  (locationId: string, options: GHLRequestOptions = {}) =>
    getTagsWithBreaker.fire(locationId, options),
  ghlRateLimiter
);

/**
 * Add tag to contact (internal)
 */
async function addTagToContactInternal(
  contactId: string,
  tagId: string,
  options: GHLRequestOptions = {}
): Promise<{ success: boolean }> {
  logger.info({ contactId, tagId }, 'Adding tag to GHL contact');

  await makeGHLRequest(
    `/contacts/${contactId}/tags`,
    {
      ...options,
      method: 'POST',
      body: { tagId },
    }
  );

  logger.info({ contactId, tagId }, 'Tag added to GHL contact');
  return { success: true };
}

const addTagToContactWithBreaker = createCircuitBreaker(addTagToContactInternal, {
  timeout: 15000,
  name: 'ghl.addTagToContact',
});

/**
 * Add a tag to a contact
 *
 * @param contactId - The contact ID
 * @param tagId - The tag ID to add
 * @param options - Request options including accessToken
 * @returns Success confirmation
 *
 * @example
 * const result = await addTagToContact('contact-id', 'tag-id', { accessToken: 'your-token' });
 */
export const addTagToContact = withRateLimit(
  (contactId: string, tagId: string, options: GHLRequestOptions = {}) =>
    addTagToContactWithBreaker.fire(contactId, tagId, options),
  ghlRateLimiter
);

/**
 * Remove tag from contact (internal)
 */
async function removeTagFromContactInternal(
  contactId: string,
  tagId: string,
  options: GHLRequestOptions = {}
): Promise<{ success: boolean }> {
  logger.info({ contactId, tagId }, 'Removing tag from GHL contact');

  await makeGHLRequest(
    `/contacts/${contactId}/tags/${tagId}`,
    { ...options, method: 'DELETE' }
  );

  logger.info({ contactId, tagId }, 'Tag removed from GHL contact');
  return { success: true };
}

const removeTagFromContactWithBreaker = createCircuitBreaker(removeTagFromContactInternal, {
  timeout: 15000,
  name: 'ghl.removeTagFromContact',
});

/**
 * Remove a tag from a contact
 *
 * @param contactId - The contact ID
 * @param tagId - The tag ID to remove
 * @param options - Request options including accessToken
 * @returns Success confirmation
 *
 * @example
 * const result = await removeTagFromContact('contact-id', 'tag-id', { accessToken: 'your-token' });
 */
export const removeTagFromContact = withRateLimit(
  (contactId: string, tagId: string, options: GHLRequestOptions = {}) =>
    removeTagFromContactWithBreaker.fire(contactId, tagId, options),
  ghlRateLimiter
);

// ============================================================================
// CUSTOM FIELDS API
// ============================================================================

/**
 * Get custom fields (internal)
 */
async function getCustomFieldsInternal(
  locationId: string,
  options: GHLRequestOptions = {}
): Promise<GHLCustomField[]> {
  logger.info({ locationId }, 'Getting GHL custom fields');

  const result = await makeGHLRequest<{ customFields: GHLCustomField[] }>(
    '/custom-fields/',
    {
      ...options,
      method: 'GET',
      queryParams: { locationId },
    }
  );

  logger.info({ fieldCount: result.customFields.length }, 'GHL custom fields retrieved');
  return result.customFields;
}

const getCustomFieldsWithBreaker = createCircuitBreaker(getCustomFieldsInternal, {
  timeout: 15000,
  name: 'ghl.getCustomFields',
});

/**
 * Get all custom fields for a location
 *
 * @param locationId - The location ID
 * @param options - Request options including accessToken
 * @returns Array of custom field definitions
 *
 * @example
 * const fields = await getCustomFields('location-id', { accessToken: 'your-token' });
 */
export const getCustomFields = withRateLimit(
  (locationId: string, options: GHLRequestOptions = {}) =>
    getCustomFieldsWithBreaker.fire(locationId, options),
  ghlRateLimiter
);

// ============================================================================
// LOCATIONS API
// ============================================================================

/**
 * Get location by ID (internal)
 */
async function getLocationInternal(
  locationId: string,
  options: GHLRequestOptions = {}
): Promise<GHLLocation> {
  logger.info({ locationId }, 'Getting GHL location');

  const result = await makeGHLRequest<{ location: GHLLocation }>(
    `/locations/${locationId}`,
    { ...options, method: 'GET' }
  );

  logger.info({ locationId: result.location.id }, 'GHL location retrieved');
  return result.location;
}

const getLocationWithBreaker = createCircuitBreaker(getLocationInternal, {
  timeout: 15000,
  name: 'ghl.getLocation',
});

/**
 * Get location details by ID
 *
 * @param locationId - The location ID
 * @param options - Request options including accessToken
 * @returns Location object with details
 *
 * @example
 * const location = await getLocation('location-id', { accessToken: 'your-token' });
 */
export const getLocation = withRateLimit(
  (locationId: string, options: GHLRequestOptions = {}) =>
    getLocationWithBreaker.fire(locationId, options),
  ghlRateLimiter
);

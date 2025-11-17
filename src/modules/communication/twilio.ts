/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import { Twilio } from 'twilio';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Twilio Module
 *
 * Send SMS, make voice calls, and send WhatsApp messages
 * - Send SMS messages
 * - Make voice calls
 * - Send WhatsApp messages
 * - Get message status
 * - Retrieve message history
 * - Send MMS with media
 * - Built-in resilience
 *
 * Perfect for:
 * - Two-factor authentication
 * - Alerts and notifications
 * - Customer communication
 * - Voice automation
 * - WhatsApp Business messaging
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  logger.warn('⚠️  TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set. Twilio features will not work.');
}

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// Rate limiter: Twilio allows high throughput, conservative limit
const twilioRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 100, // 100ms between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'twilio',
});

export interface SendSMSOptions {
  to: string;
  body: string;
  from?: string; // Optional, defaults to TWILIO_PHONE_NUMBER
  statusCallback?: string; // Webhook for status updates
  mediaUrl?: string[]; // For MMS
}

export interface SMSResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  dateCreated: Date;
}

/**
 * Send SMS message
 */
async function sendSMSInternal(options: SendSMSOptions): Promise<SMSResponse> {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  const from = options.from || TWILIO_PHONE_NUMBER;
  if (!from) {
    throw new Error('No from number specified. Set TWILIO_PHONE_NUMBER or provide from parameter.');
  }

  logger.info(
    {
      to: options.to,
      from,
      bodyLength: options.body.length,
      hasMedia: !!options.mediaUrl,
    },
    'Sending SMS via Twilio'
  );

  const message = await twilioClient.messages.create({
    to: options.to,
    from,
    body: options.body,
    statusCallback: options.statusCallback,
    mediaUrl: options.mediaUrl,
  });

  logger.info({ sid: message.sid, status: message.status }, 'SMS sent via Twilio');

  return {
    sid: message.sid,
    status: message.status,
    to: message.to,
    from: message.from,
    body: message.body,
    dateCreated: message.dateCreated,
  };
}

const sendSMSWithBreaker = createCircuitBreaker(sendSMSInternal, {
  timeout: 10000,
  name: 'twilio-send-sms',
});

const sendSMSRateLimited = withRateLimit(
  async (options: SendSMSOptions) => sendSMSWithBreaker.fire(options),
  twilioRateLimiter
);

export async function sendSMS(options: SendSMSOptions): Promise<SMSResponse> {
  return await sendSMSRateLimited(options) as unknown as SMSResponse;
}

export interface MakeCallOptions {
  to: string;
  from?: string;
  url?: string; // TwiML URL for call instructions
  twiml?: string; // TwiML content
  statusCallback?: string;
}

export interface CallResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  dateCreated: Date;
}

/**
 * Make voice call
 */
async function makeCallInternal(options: MakeCallOptions): Promise<CallResponse> {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  const from = options.from || TWILIO_PHONE_NUMBER;
  if (!from) {
    throw new Error('No from number specified. Set TWILIO_PHONE_NUMBER or provide from parameter.');
  }

  if (!options.url && !options.twiml) {
    throw new Error('Either url or twiml must be provided for call instructions.');
  }

  logger.info(
    {
      to: options.to,
      from,
      hasUrl: !!options.url,
      hasTwiml: !!options.twiml,
    },
    'Making voice call via Twilio'
  );

  const call = await twilioClient.calls.create({
    to: options.to,
    from,
    url: options.url,
    twiml: options.twiml,
    statusCallback: options.statusCallback,
  });

  logger.info({ sid: call.sid, status: call.status }, 'Voice call initiated via Twilio');

  return {
    sid: call.sid,
    status: call.status,
    to: call.to,
    from: call.from,
    dateCreated: call.dateCreated,
  };
}

const makeCallWithBreaker = createCircuitBreaker(makeCallInternal, {
  timeout: 15000,
  name: 'twilio-make-call',
});

const makeCallRateLimited = withRateLimit(
  async (options: MakeCallOptions) => makeCallWithBreaker.fire(options),
  twilioRateLimiter
);

export async function makeCall(options: MakeCallOptions): Promise<CallResponse> {
  return await makeCallRateLimited(options) as unknown as CallResponse;
}

export interface SendWhatsAppOptions {
  to: string;
  body: string;
  from?: string; // Optional, defaults to TWILIO_WHATSAPP_NUMBER
  mediaUrl?: string[];
}

/**
 * Send WhatsApp message via Twilio
 */
async function sendWhatsAppInternal(options: SendWhatsAppOptions): Promise<SMSResponse> {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  const from = options.from || TWILIO_WHATSAPP_NUMBER;
  if (!from) {
    throw new Error('No WhatsApp number specified. Set TWILIO_WHATSAPP_NUMBER or provide from parameter.');
  }

  // Ensure numbers are in WhatsApp format
  const whatsappFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const whatsappTo = options.to.startsWith('whatsapp:') ? options.to : `whatsapp:${options.to}`;

  logger.info(
    {
      to: whatsappTo,
      from: whatsappFrom,
      bodyLength: options.body.length,
      hasMedia: !!options.mediaUrl,
    },
    'Sending WhatsApp message via Twilio'
  );

  const message = await twilioClient.messages.create({
    to: whatsappTo,
    from: whatsappFrom,
    body: options.body,
    mediaUrl: options.mediaUrl,
  });

  logger.info({ sid: message.sid, status: message.status }, 'WhatsApp message sent via Twilio');

  return {
    sid: message.sid,
    status: message.status,
    to: message.to,
    from: message.from,
    body: message.body,
    dateCreated: message.dateCreated,
  };
}

const sendWhatsAppWithBreaker = createCircuitBreaker(sendWhatsAppInternal, {
  timeout: 10000,
  name: 'twilio-send-whatsapp',
});

const sendWhatsAppRateLimited = withRateLimit(
  async (options: SendWhatsAppOptions) => sendWhatsAppWithBreaker.fire(options),
  twilioRateLimiter
);

export async function sendWhatsApp(options: SendWhatsAppOptions): Promise<SMSResponse> {
  return await sendWhatsAppRateLimited(options) as unknown as SMSResponse;
}

export interface MessageStatus {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  dateCreated: Date;
  dateSent: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Get message status
 */
async function getMessageStatusInternal(messageSid: string): Promise<MessageStatus> {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  logger.info({ messageSid }, 'Fetching message status from Twilio');

  const message = await twilioClient.messages(messageSid).fetch();

  logger.info({ sid: message.sid, status: message.status }, 'Message status retrieved');

  return {
    sid: message.sid,
    status: message.status,
    to: message.to,
    from: message.from,
    body: message.body,
    dateCreated: message.dateCreated,
    dateSent: message.dateSent,
    errorCode: message.errorCode,
    errorMessage: message.errorMessage,
  };
}

const getMessageStatusWithBreaker = createCircuitBreaker(getMessageStatusInternal, {
  timeout: 10000,
  name: 'twilio-get-message-status',
});

const getMessageStatusRateLimited = withRateLimit(
  async (messageSid: string) => getMessageStatusWithBreaker.fire(messageSid),
  twilioRateLimiter
);

export async function getMessageStatus(messageSid: string): Promise<MessageStatus> {
  return await getMessageStatusRateLimited(messageSid) as unknown as MessageStatus;
}

export interface ListMessagesOptions {
  to?: string;
  from?: string;
  dateSent?: Date;
  limit?: number;
}

export interface MessageRecord {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  dateCreated: Date;
}

/**
 * List messages with filters
 */
async function listMessagesInternal(options: ListMessagesOptions = {}): Promise<MessageRecord[]> {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  logger.info(options, 'Listing messages from Twilio');

  const messages = await twilioClient.messages.list({
    to: options.to,
    from: options.from,
    dateSent: options.dateSent,
    limit: options.limit || 20,
  });

  logger.info({ count: messages.length }, 'Messages retrieved from Twilio');

  return messages.map((msg) => ({
    sid: msg.sid,
    status: msg.status,
    to: msg.to,
    from: msg.from,
    body: msg.body,
    dateCreated: msg.dateCreated,
  }));
}

const listMessagesWithBreaker = createCircuitBreaker(listMessagesInternal, {
  timeout: 10000,
  name: 'twilio-list-messages',
});

const listMessagesRateLimited = withRateLimit(
  async (options: ListMessagesOptions) => listMessagesWithBreaker.fire(options),
  twilioRateLimiter
);

export async function listMessages(options: ListMessagesOptions = {}): Promise<MessageRecord[]> {
  return await listMessagesRateLimited(options) as unknown as MessageRecord[];
}

export interface SendMMSOptions {
  to: string;
  body: string;
  mediaUrl: string[]; // Array of media URLs
  from?: string;
}

/**
 * Send MMS with media attachments
 */
export async function sendMMS(options: SendMMSOptions): Promise<SMSResponse> {
  return sendSMS({
    to: options.to,
    body: options.body,
    from: options.from,
    mediaUrl: options.mediaUrl,
  });
}

export interface GetCallStatusOptions {
  callSid: string;
}

export interface CallStatus {
  sid: string;
  status: string;
  to: string;
  from: string;
  duration: string | null;
  dateCreated: Date;
}

/**
 * Get call status
 */
async function getCallStatusInternal(callSid: string): Promise<CallStatus> {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  logger.info({ callSid }, 'Fetching call status from Twilio');

  const call = await twilioClient.calls(callSid).fetch();

  logger.info({ sid: call.sid, status: call.status }, 'Call status retrieved');

  return {
    sid: call.sid,
    status: call.status,
    to: call.to,
    from: call.from,
    duration: call.duration,
    dateCreated: call.dateCreated,
  };
}

const getCallStatusWithBreaker = createCircuitBreaker(getCallStatusInternal, {
  timeout: 10000,
  name: 'twilio-get-call-status',
});

const getCallStatusRateLimited = withRateLimit(
  async (callSid: string) => getCallStatusWithBreaker.fire(callSid),
  twilioRateLimiter
);

export async function getCallStatus(callSid: string): Promise<CallStatus> {
  return await getCallStatusRateLimited(callSid) as unknown as CallStatus;
}

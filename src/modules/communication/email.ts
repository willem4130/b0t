import { Resend } from 'resend';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Email Module (Resend)
 *
 * Send transactional emails with Resend
 * - Simple, modern API
 * - React email template support
 * - Built-in resilience (circuit breaker, rate limiting)
 * - Structured logging
 *
 * Perfect for:
 * - Sending notifications
 * - Workflow alerts
 * - Reports and summaries
 * - User communications
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  logger.warn('⚠️  RESEND_API_KEY not set. Email features will not work.');
}

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Rate limiter: 100 emails per minute (conservative for Resend free tier)
const emailRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 600, // 600ms = ~100/min
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000,
  id: 'email-resend',
});

export interface EmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface EmailResponse {
  id: string;
}

/**
 * Internal send email function (unprotected)
 */
async function sendEmailInternal(options: EmailOptions): Promise<EmailResponse> {
  if (!resendClient) {
    throw new Error('Resend client not initialized. Set RESEND_API_KEY.');
  }

  logger.info(
    {
      from: options.from,
      to: Array.isArray(options.to) ? options.to.length : 1,
      subject: options.subject.substring(0, 50),
    },
    'Sending email via Resend'
  );

  const emailPayload: {
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    tags?: { name: string; value: string }[];
  } = {
    from: options.from,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
  };

  if (options.html) emailPayload.html = options.html;
  if (options.text) emailPayload.text = options.text;
  if (options.cc) emailPayload.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
  if (options.bcc) emailPayload.bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
  if (options.replyTo) emailPayload.replyTo = options.replyTo;
  if (options.tags) emailPayload.tags = options.tags;

  const { data, error } = await resendClient.emails.send(emailPayload as never);

  if (error) {
    logger.error({ error }, 'Failed to send email');
    throw new Error(`Email send failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('Email send failed: No data returned');
  }

  logger.info({ emailId: data.id }, 'Email sent successfully');

  return { id: data.id };
}

/**
 * Send email (protected with circuit breaker + rate limiting)
 */
const sendEmailWithBreaker = createCircuitBreaker(sendEmailInternal, {
  timeout: 15000,
  name: 'send-email',
});

export const sendEmail = withRateLimit(
  (options: EmailOptions) => sendEmailWithBreaker.fire(options),
  emailRateLimiter
);

/**
 * Send simple text email (convenience function)
 */
export async function sendTextEmail(
  from: string,
  to: string | string[],
  subject: string,
  text: string
): Promise<EmailResponse> {
  return sendEmail({ from, to, subject, text });
}

/**
 * Send HTML email (convenience function)
 */
export async function sendHtmlEmail(
  from: string,
  to: string | string[],
  subject: string,
  html: string
): Promise<EmailResponse> {
  return sendEmail({ from, to, subject, html });
}

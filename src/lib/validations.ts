import { z } from 'zod';

/**
 * Validation schemas using Zod
 *
 * Use these to validate API inputs, form data, and external API responses
 */

// Tweet validation
export const tweetSchema = z.object({
  content: z.string().min(1).max(280, 'Tweet must be 280 characters or less'),
  status: z.enum(['draft', 'posted', 'failed']).default('draft'),
  tweetId: z.string().optional(),
});

export const createTweetSchema = z.object({
  content: z.string().min(1).max(280),
});

// YouTube validation
export const youtubeVideoSchema = z.object({
  videoId: z.string().min(1, 'Video ID is required'),
  title: z.string().optional(),
  channelId: z.string().optional(),
});

export const youtubeCommentSchema = z.object({
  commentId: z.string().min(1),
  videoId: z.string().min(1),
  text: z.string().min(1),
  authorDisplayName: z.string().optional(),
});

// Job trigger validation
export const triggerJobSchema = z.object({
  job: z.string().min(1, 'Job name is required'),
});

// Cron schedule validation
export const cronScheduleSchema = z.object({
  schedule: z.string().regex(
    /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
    'Invalid cron expression'
  ),
  enabled: z.boolean().default(false),
});

// AI prompt validation
export const promptSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(2000, 'Prompt too long'),
  model: z.string().default('gpt-4o-mini'),
});

// Automation configuration
export const automationConfigSchema = z.object({
  jobName: z.string().min(1),
  schedule: z.string().min(1),
  prompt: z.string().min(1),
  enabled: z.boolean(),
});

// API Response schemas
export const apiSuccessSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.any().optional(),
});

export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
  code: z.string().optional(),
});

// Types inferred from schemas
export type Tweet = z.infer<typeof tweetSchema>;
export type CreateTweet = z.infer<typeof createTweetSchema>;
export type YouTubeVideo = z.infer<typeof youtubeVideoSchema>;
export type YouTubeComment = z.infer<typeof youtubeCommentSchema>;
export type TriggerJob = z.infer<typeof triggerJobSchema>;
export type CronSchedule = z.infer<typeof cronScheduleSchema>;
export type Prompt = z.infer<typeof promptSchema>;
export type AutomationConfig = z.infer<typeof automationConfigSchema>;

// Credential validation schemas
export const credentialTypeSchema = z.enum(['api_key', 'token', 'secret', 'connection_string', 'multi_field']);

// Platform-specific credential validators
// OpenAI keys can be: sk-... (legacy), sk-proj-... (project), sk-org-... (organization)
const openaiKeySchema = z.string().regex(/^sk-[a-zA-Z0-9_-]{20,}$/, 'Invalid OpenAI API key format (must start with sk-)');
const anthropicKeySchema = z.string().regex(/^sk-ant-[a-zA-Z0-9_-]{95,}$/, 'Invalid Anthropic API key format (must start with sk-ant-)');
const stripeKeySchema = z.string().regex(/^(sk|pk)_(test|live)_[a-zA-Z0-9]{24,}$/, 'Invalid Stripe key format');
const slackTokenSchema = z.string().regex(/^xox[abp]-[a-zA-Z0-9-]+$/, 'Invalid Slack token format');
const discordTokenSchema = z.string().min(50).max(100);
const telegramTokenSchema = z.string().regex(/^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/, 'Invalid Telegram bot token format');
const githubTokenSchema = z.string().regex(/^(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}$/, 'Invalid GitHub token format');
const redditTokenSchema = z.string().min(20);
const resendKeySchema = z.string().regex(/^re_[a-zA-Z0-9]{32,}$/, 'Invalid Resend API key format');

// Generic validators for unknown platforms
const genericApiKeySchema = z.string().min(10, 'API key must be at least 10 characters').max(500, 'API key too long');
const genericTokenSchema = z.string().min(10, 'Token must be at least 10 characters').max(500, 'Token too long');
const genericSecretSchema = z.string().min(8, 'Secret must be at least 8 characters').max(500, 'Secret too long');
const connectionStringSchema = z.string().min(10, 'Connection string must be at least 10 characters').max(2000, 'Connection string too long');

// Platform-specific credential value validators
const credentialValueValidators: Record<string, z.ZodString> = {
  'openai': openaiKeySchema,
  'anthropic': anthropicKeySchema,
  'stripe': stripeKeySchema,
  'slack': slackTokenSchema,
  'discord': discordTokenSchema,
  'telegram': telegramTokenSchema,
  'github': githubTokenSchema,
  'reddit': redditTokenSchema,
  'resend': resendKeySchema,
};

/**
 * Validates a credential value based on the platform
 */
export function validateCredentialValue(platform: string, value: string, type: string): { success: boolean; error?: string } {
  const validator = credentialValueValidators[platform.toLowerCase()];

  if (validator) {
    const result = validator.safeParse(value);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message || 'Invalid credential format' };
    }
  } else {
    // Use generic validators for unknown platforms
    let genericValidator: z.ZodString;
    switch (type) {
      case 'api_key':
        genericValidator = genericApiKeySchema;
        break;
      case 'token':
        genericValidator = genericTokenSchema;
        break;
      case 'secret':
        genericValidator = genericSecretSchema;
        break;
      case 'connection_string':
        genericValidator = connectionStringSchema;
        break;
      default:
        genericValidator = genericApiKeySchema;
    }

    const result = genericValidator.safeParse(value);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message || 'Invalid credential format' };
    }
  }

  return { success: true };
}

// Credential creation schema (supports both single and multi-field)
export const createCredentialSchema = z.object({
  platform: z.string().min(1, 'Platform is required').max(100, 'Platform name too long'),
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  value: z.string().optional(), // For single-field credentials
  fields: z.record(z.string(), z.string()).optional(), // For multi-field credentials
  type: credentialTypeSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  organizationId: z.string().optional(),
}).superRefine((data, ctx) => {
  // Ensure either value or fields is provided
  if (!data.value && (!data.fields || Object.keys(data.fields).length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either value or fields must be provided',
      path: ['value'],
    });
  }

  // If value is provided, validate it
  if (data.value) {
    const validation = validateCredentialValue(data.platform, data.value, data.type);
    if (!validation.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error || 'Invalid credential format',
        path: ['value'],
      });
    }
  }
});

export type CreateCredential = z.infer<typeof createCredentialSchema>;

/* eslint-disable */
// @ts-nocheck - Duplicate exports from multiple modules
/**
 * Workflow Modules (n8n-style Nodes)
 *
 * This directory contains reusable, composable modules for building AI-generated workflows.
 * Each module is self-contained and follows a consistent pattern:
 * - Type-safe interfaces
 * - Built-in resilience (circuit breakers, retries, rate limiting)
 * - Structured logging
 * - Clear input/output contracts
 *
 * Directory Structure:
 * - social/          Social media platforms (Twitter, Instagram, YouTube, LinkedIn, etc.)
 * - ai/              AI/ML services (OpenAI, Anthropic, Replicate, etc.)
 * - content/         Content platforms (WordPress, Ghost, Medium, etc.)
 * - external-apis/   Third-party data APIs (RapidAPI, news, search, etc.)
 * - communication/   Email, SMS, chat platforms (coming soon)
 * - data/            Databases, spreadsheets, storage (coming soon)
 * - utilities/       Helper functions, transformations (coming soon)
 *
 * Usage in Workflows:
 * ```typescript
 * import { searchTwitter } from '@/modules/external-apis/rapidapi/twitter';
 * import { generateTweetReply } from '@/modules/ai/openai';
 * import { replyToTweet } from '@/modules/social/twitter';
 *
 * // Use in pipeline
 * const pipeline = createPipeline()
 *   .step('search', async () => await searchTwitter({ query: 'AI' }))
 *   .step('generate', async (ctx) => await generateTweetReply(ctx.tweet.text))
 *   .step('post', async (ctx) => await replyToTweet(ctx.tweet.id, ctx.reply))
 *   .execute();
 * ```
 */

// Social Media Modules
export * from './social';

// AI Modules
export * from './ai';

// Content Modules
export * from './content';

// External API Modules
export * from './external-apis';

// Utility Modules (NEW)
export * from './utilities';

// Communication Modules (NEW)
export * from './communication';

// Data Modules (NEW)
export * from './data';

// Productivity Modules (NEW)
export * from './productivity';

// DevTools Modules (NEW)
export * from './devtools';

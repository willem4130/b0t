/**
 * External API Modules
 *
 * Reusable modules for third-party APIs (RapidAPI services, etc.)
 * These are typically read-only data fetching modules with built-in:
 * - Automatic retries with exponential backoff
 * - Response caching (where applicable)
 * - Structured logging
 * - Error handling
 */

export * from './rapidapi';
export * as hackernews from './hackernews';

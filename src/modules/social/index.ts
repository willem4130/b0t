/**
 * Social Media Modules
 *
 * Reusable modules for social media platforms (Twitter, Instagram, YouTube, etc.)
 * Each module provides authenticated API operations with built-in:
 * - Circuit breakers
 * - Rate limiting
 * - Automatic retries
 * - Structured logging
 */

export * as twitter from './twitter';
export * as instagram from './instagram';
export * as youtube from './youtube';
export * as linkedin from './linkedin';
export * as facebook from './facebook';

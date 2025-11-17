import slugify from 'slugify';

/**
 * String Utilities Module
 *
 * Common string manipulation functions for workflows
 * - Slugification
 * - Case conversion
 * - Truncation
 * - Sanitization
 * - Template parsing
 * - Validation
 *
 * Perfect for:
 * - Creating URL-friendly slugs
 * - Formatting text for display
 * - Cleaning user input
 * - Template string replacement
 */

/**
 * Convert string to URL-friendly slug
 * @param text - Text to slugify
 * @param options - Slugify options
 */
export function toSlug(
  text: string,
  options?: {
    lower?: boolean;
    strict?: boolean;
    replacement?: string;
  }
): string {
  return slugify(text, {
    lower: options?.lower ?? true,
    strict: options?.strict ?? false,
    replacement: options?.replacement ?? '-',
  });
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, '');
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => word.toUpperCase())
    .replace(/\s+/g, '');
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Truncate string to max length
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add (default: '...')
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Truncate string to max words
 */
export function truncateWords(
  str: string,
  maxWords: number,
  suffix: string = '...'
): string {
  const words = str.split(/\s+/);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ') + suffix;
}

/**
 * Remove HTML tags from string
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Capitalize first letter of string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Capitalize first letter of each word
 */
export function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Reverse a string
 */
export function reverse(str: string): string {
  return str.split('').reverse().join('');
}

/**
 * Check if string is email
 */
export function isEmail(str: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(str);
}

/**
 * Check if string is URL
 */
export function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract URLs from text
 */
export function extractUrls(str: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return str.match(urlRegex) || [];
}

/**
 * Extract email addresses from text
 */
export function extractEmails(str: string): string[] {
  const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
  return str.match(emailRegex) || [];
}

/**
 * Remove extra whitespace
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Count words in string
 */
export function wordCount(str: string): number {
  return str.split(/\s+/).filter(Boolean).length;
}

/**
 * Count characters (excluding whitespace)
 */
export function charCount(str: string, includeSpaces: boolean = false): number {
  if (includeSpaces) return str.length;
  return str.replace(/\s/g, '').length;
}

/**
 * Simple template string replacement
 * @example
 * template('Hello {{name}}!', { name: 'World' }) => 'Hello World!'
 */
export function template(
  str: string,
  variables: Record<string, string | number>
): string {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key]?.toString() || match;
  });
}

/**
 * Remove accents/diacritics from string
 */
export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Generate random string
 */
export function randomString(
  length: number,
  chars: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Mask sensitive data (e.g., credit cards, emails)
 * @example
 * mask('john@example.com', 4, '*') => 'john****example.com'
 */
export function mask(
  str: string,
  visibleChars: number = 4,
  maskChar: string = '*'
): string {
  if (str.length <= visibleChars * 2) return str;
  const start = str.slice(0, visibleChars);
  const end = str.slice(-visibleChars);
  const middle = maskChar.repeat(str.length - visibleChars * 2);
  return start + middle + end;
}

/**
 * Concatenate multiple strings together
 * @param strings - Array of strings to concatenate
 * @param separator - Optional separator between strings (default: '')
 * @example
 * concat(['Hello', 'World'], ' ') => 'Hello World'
 * concat(['# Title\n\n', 'Content here']) => '# Title\n\nContent here'
 */
export function concat(strings: string[], separator: string = ''): string {
  return strings.join(separator);
}

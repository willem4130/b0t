import {
  format,
  parse,
  add,
  sub,
  isAfter,
  isBefore,
  isEqual,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays as dateFnsAddDays,
  addHours as dateFnsAddHours,
  addMinutes as dateFnsAddMinutes,
  subDays as dateFnsSubDays,
  subHours as dateFnsSubHours,
  subMinutes as dateFnsSubMinutes,
  formatDistance,
  formatRelative,
  isValid,
  parseISO,
  formatISO,
} from 'date-fns';

/**
 * Date/Time Utilities Module
 *
 * Comprehensive date and time manipulation using date-fns
 * - Tree-shakeable (only imports what you use)
 * - Immutable & pure functions
 * - TypeScript support
 * - No timezone wrapper (works with native Date)
 *
 * Perfect for:
 * - Formatting dates for display
 * - Calculating date differences
 * - Scheduling workflows
 * - Time-based logic in automations
 */

/**
 * Format a date to a string
 * @param date - Date to format
 * @param formatString - Format string (e.g., 'yyyy-MM-dd', 'MMM dd, yyyy')
 * @returns Formatted date string
 */
export function formatDate(date: Date | number, formatString: string): string {
  return format(date, formatString);
}

/**
 * Parse a date string
 * @param dateString - Date string to parse
 * @param formatString - Format string that matches the input
 * @param referenceDate - Reference date for parsing (default: now)
 * @returns Parsed Date object
 */
export function parseDate(
  dateString: string,
  formatString: string,
  referenceDate: Date = new Date()
): Date {
  return parse(dateString, formatString, referenceDate);
}

/**
 * Add time to a date
 */
export function addTime(date: Date, duration: Duration): Date {
  return add(date, duration);
}

/**
 * Subtract time from a date
 */
export function subtractTime(date: Date, duration: Duration): Date {
  return sub(date, duration);
}

/**
 * Check if date is after another date
 */
export function isAfterDate(date: Date, dateToCompare: Date): boolean {
  return isAfter(date, dateToCompare);
}

/**
 * Check if date is before another date
 */
export function isBeforeDate(date: Date, dateToCompare: Date): boolean {
  return isBefore(date, dateToCompare);
}

/**
 * Check if two dates are equal
 */
export function isEqualDate(date: Date, dateToCompare: Date): boolean {
  return isEqual(date, dateToCompare);
}

/**
 * Get difference between dates in days
 */
export function getDaysDifference(dateLeft: Date, dateRight: Date): number {
  return differenceInDays(dateLeft, dateRight);
}

/**
 * Get difference between dates in hours
 */
export function getHoursDifference(dateLeft: Date, dateRight: Date): number {
  return differenceInHours(dateLeft, dateRight);
}

/**
 * Get difference between dates in minutes
 */
export function getMinutesDifference(dateLeft: Date, dateRight: Date): number {
  return differenceInMinutes(dateLeft, dateRight);
}

/**
 * Get start of day (00:00:00)
 */
export function getStartOfDay(date: Date): Date {
  return startOfDay(date);
}

/**
 * Get end of day (23:59:59.999)
 */
export function getEndOfDay(date: Date): Date {
  return endOfDay(date);
}

/**
 * Get start of week
 */
export function getStartOfWeek(date: Date): Date {
  return startOfWeek(date);
}

/**
 * Get end of week
 */
export function getEndOfWeek(date: Date): Date {
  return endOfWeek(date);
}

/**
 * Get start of month
 */
export function getStartOfMonth(date: Date): Date {
  return startOfMonth(date);
}

/**
 * Get end of month
 */
export function getEndOfMonth(date: Date): Date {
  return endOfMonth(date);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  return dateFnsAddDays(date, days);
}

/**
 * Add hours to a date
 */
export function addHours(date: Date, hours: number): Date {
  return dateFnsAddHours(date, hours);
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  return dateFnsAddMinutes(date, minutes);
}

/**
 * Subtract days from a date
 */
export function subDays(date: Date, days: number): Date {
  return dateFnsSubDays(date, days);
}

/**
 * Subtract hours from a date
 */
export function subHours(date: Date, hours: number): Date {
  return dateFnsSubHours(date, hours);
}

/**
 * Subtract minutes from a date
 */
export function subMinutes(date: Date, minutes: number): Date {
  return dateFnsSubMinutes(date, minutes);
}

/**
 * Format distance between dates in words (e.g., "3 days ago")
 */
export function getDistanceInWords(date: Date, baseDate: Date = new Date()): string {
  return formatDistance(date, baseDate, { addSuffix: true });
}

/**
 * Format date relative to now (e.g., "last Friday at 2:26 PM")
 */
export function getRelativeTime(date: Date, baseDate: Date = new Date()): string {
  return formatRelative(date, baseDate);
}

/**
 * Check if date is valid
 */
export function isValidDate(date: unknown): boolean {
  return isValid(date);
}

/**
 * Parse ISO 8601 string to Date
 */
export function fromISO(isoString: string): Date {
  return parseISO(isoString);
}

/**
 * Format Date to ISO 8601 string
 */
export function toISO(date: Date): string {
  return formatISO(date);
}

/**
 * Get current timestamp
 */
export function now(): Date {
  return new Date();
}

/**
 * Get current Unix timestamp (seconds since epoch)
 */
export function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get current timestamp in milliseconds
 */
export function timestamp(): number {
  return Date.now();
}

/**
 * Duration type for adding/subtracting time
 */
export interface Duration {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

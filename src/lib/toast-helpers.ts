/**
 * Toast notification helpers for rate limit warnings and errors
 *
 * Uses sonner for toast notifications
 */

import { toast } from 'sonner';

/**
 * Format a time duration in milliseconds to a human-readable string
 */
function formatResetTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Show a rate limit warning toast
 *
 * @param limitType - Type of limit that was hit
 * @param resetIn - Milliseconds until limit resets
 */
export function showRateLimitWarning(
  limitType: '15min' | 'hour' | '24hour' | 'month',
  resetIn: number
) {
  const limitLabels = {
    '15min': '15-minute',
    'hour': 'hourly',
    '24hour': '24-hour',
    'month': 'monthly',
  };

  const resetTime = formatResetTime(resetIn);

  toast.warning(`Paws! ⚠️ Approaching ${limitLabels[limitType]} rate limit`, {
    description: `Time for a quick cat nap! Limit resets in ${resetTime}. 😺`,
    duration: 8000,
  });
}

/**
 * Show a rate limit exceeded error toast
 *
 * @param limitType - Type of limit that was exceeded
 * @param resetIn - Milliseconds until limit resets
 */
export function showRateLimitError(
  limitType: '15min' | 'hour' | '24hour' | 'month',
  resetIn: number
) {
  const limitLabels = {
    '15min': '15-minute',
    'hour': 'hourly',
    '24hour': '24-hour',
    'month': 'monthly',
  };

  const resetTime = formatResetTime(resetIn);

  toast.error(`Taking a cat nap 😴 ${limitLabels[limitType]} limit reached`, {
    description: `Time to rest those paws! Resets in ${resetTime}. Automation paused. 💤`,
    duration: 10000,
  });
}

/**
 * Show Twitter API 403 error toast
 *
 * @param details - Error details (optional)
 */
export function showTwitter403Error(details?: string) {
  window.dispatchEvent(new CustomEvent('cat:error'));

  toast.error('Access fur-bidden 🚫😿', {
    description:
      details ||
      'The cat can\'t access this! You may have hit your daily rate limit.',
    duration: 10000,
  });
}

/**
 * Show Twitter API 429 error toast (Too Many Requests)
 *
 * @param retryAfter - Seconds until retry (from retry-after header)
 */
export function showTwitter429Error(retryAfter?: number) {
  window.dispatchEvent(new CustomEvent('cat:error'));

  const resetTime = retryAfter ? formatResetTime(retryAfter * 1000) : 'a few minutes';

  toast.error('Whoa there, speedy paws! 🐾', {
    description: `Too many requests. The cat needs ${resetTime} to recharge. 😴`,
    duration: 10000,
  });
}

/**
 * Show a generic API error toast
 *
 * @param error - Error message
 */
export function showApiError(error: string) {
  window.dispatchEvent(new CustomEvent('cat:error'));

  toast.error('Meow-ch! 😿', {
    description: error,
    duration: 6000,
  });
}

/**
 * Show a success toast for Twitter actions
 *
 * @param message - Success message
 */
export function showTwitterSuccess(message: string) {
  window.dispatchEvent(new CustomEvent('cat:success'));

  toast.success('Purrfect! 🐱✅', {
    description: message,
    duration: 4000,
  });
}

/**
 * Show an info toast for limit status
 *
 * @param message - Info message
 * @param description - Additional details
 */
export function showLimitInfo(message: string, description?: string) {
  toast.info(message, {
    description,
    duration: 5000,
  });
}

/**
 * Check usage percentage and show warning if approaching limit
 *
 * @param percentUsed - Percentage of limit used (0-100)
 * @param limitType - Type of limit
 * @param resetIn - Milliseconds until reset
 */
export function checkAndWarnLimitUsage(
  percentUsed: number,
  limitType: '15min' | 'hour' | '24hour' | 'month',
  resetIn: number
) {
  if (percentUsed >= 90) {
    showRateLimitWarning(limitType, resetIn);
  } else if (percentUsed >= 100) {
    showRateLimitError(limitType, resetIn);
  }
}

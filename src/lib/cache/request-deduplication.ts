import pino from 'pino';

const logger = pino({ name: 'request-deduplication' });

/**
 * Request deduplication middleware
 * Prevents duplicate simultaneous requests from hitting the backend
 */

const pendingRequests = new Map<string, Promise<unknown>>();

/**
 * Deduplicate requests by key
 * If the same request is made while a previous one is pending, return the pending promise
 *
 * @param key Unique identifier for this request
 * @param fetcher Function that performs the actual request
 * @returns The result of the request
 *
 * @example
 * const data = await deduplicatedFetch(
 *   'automation-settings-reply-to-tweets',
 *   () => fetch('/api/automation/settings?job=reply-to-tweets').then(r => r.json())
 * );
 */
export async function deduplicatedFetch<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  // Check if there's already a pending request for this key
  if (pendingRequests.has(key)) {
    logger.debug({ key }, 'Deduplicating request - using existing promise');
    return pendingRequests.get(key) as Promise<T>;
  }

  // Create new promise and store it
  const promise = fetcher()
    .finally(() => {
      // Clean up after the request completes
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, promise);

  return promise;
}

/**
 * Get the number of pending requests (for monitoring)
 */
export function getPendingRequestsCount(): number {
  return pendingRequests.size;
}

/**
 * Clear all pending requests (for testing/cleanup)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

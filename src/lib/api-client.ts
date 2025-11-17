/**
 * Unified API Client
 *
 * Provides consistent error handling, request/response formatting,
 * and logging across all API calls in the application.
 *
 * Benefits:
 * - Consistent error messages and handling
 * - Automatic JSON parsing with error recovery
 * - Type-safe responses
 * - Centralized logging for debugging
 * - Reduces code duplication across 40+ components
 */

import { logger } from './logger';

export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

interface RequestOptions extends RequestInit {
  timeout?: number;
}

/**
 * Make a fetch request with consistent error handling
 */
async function request<T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeout = 30000, ...fetchOptions } = options;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle non-OK responses
    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      let errorDetails: unknown;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        errorDetails = errorData.details;
      } catch {
        // If JSON parsing fails, try to get text
        try {
          errorMessage = await response.text() || errorMessage;
        } catch {
          // Ignore text parsing errors
        }
      }

      logger.error(
        {
          url,
          method: fetchOptions.method || 'GET',
          status: response.status,
          error: errorMessage,
        },
        'API request failed'
      );

      throw new APIError(response.status, errorMessage, errorDetails);
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return null as T;
    }

    // Parse JSON response
    try {
      return await response.json();
    } catch (error) {
      logger.error(
        {
          url,
          method: fetchOptions.method || 'GET',
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to parse API response as JSON'
      );
      throw new APIError(500, 'Invalid JSON response from server');
    }
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error(
        {
          url,
          method: fetchOptions.method || 'GET',
          timeout,
        },
        'API request timed out'
      );
      throw new APIError(408, `Request timed out after ${timeout}ms`);
    }

    // Re-throw APIError as-is
    if (error instanceof APIError) {
      throw error;
    }

    // Handle network errors
    logger.error(
      {
        url,
        method: fetchOptions.method || 'GET',
        error: error instanceof Error ? error.message : String(error),
      },
      'API request failed with network error'
    );
    throw new APIError(
      0,
      error instanceof Error ? error.message : 'Network error'
    );
  }
}

/**
 * API Client with common HTTP methods
 */
export const apiClient = {
  /**
   * GET request
   */
  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    return request<T>(url, { ...options, method: 'GET' });
  },

  /**
   * POST request with JSON body
   */
  async post<T>(
    url: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return request<T>(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * PUT request with JSON body
   */
  async put<T>(
    url: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return request<T>(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * PATCH request with JSON body
   */
  async patch<T>(
    url: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return request<T>(url, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * DELETE request
   */
  async delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return request<T>(url, { ...options, method: 'DELETE' });
  },
};

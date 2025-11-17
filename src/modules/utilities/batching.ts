import { logger } from '@/lib/logger';

/**
 * Batching and Pagination Utilities Module
 *
 * Tools for handling large datasets efficiently:
 * - Pagination for displaying data in pages
 * - Batching for processing large arrays
 * - Sequential batch processing with delays
 * - Array chunking for parallel processing
 *
 * Perfect for:
 * - Processing large API responses
 * - Rate-limited API calls
 * - Splitting work across multiple workflow steps
 * - Displaying paginated results
 */

/**
 * Paginate an array of items
 * @param items - Array of items to paginate
 * @param pageSize - Number of items per page
 * @param pageNumber - Page number (1-indexed)
 * @returns Paginated subset of items
 */
export function paginate<T>(items: T[], pageSize: number, pageNumber: number): T[] {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }

  if (pageSize <= 0) {
    throw new Error('Page size must be greater than 0');
  }

  if (pageNumber <= 0) {
    throw new Error('Page number must be greater than 0');
  }

  const startIndex = (pageNumber - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  logger.info(
    {
      totalItems: items.length,
      pageSize,
      pageNumber,
      startIndex,
      endIndex,
      resultCount: Math.min(items.length - startIndex, pageSize),
    },
    'Paginating items'
  );

  return items.slice(startIndex, endIndex);
}

/**
 * Split an array into batches
 * @param items - Array of items to batch
 * @param batchSize - Size of each batch
 * @returns Array of batches
 */
export function createBatches<T>(items: T[], batchSize: number): T[][] {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }

  if (batchSize <= 0) {
    throw new Error('Batch size must be greater than 0');
  }

  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  logger.info(
    {
      totalItems: items.length,
      batchSize,
      totalBatches: batches.length,
    },
    'Created batches'
  );

  return batches;
}

/**
 * Process batches sequentially with delays
 * Useful for rate-limited APIs or avoiding overload
 * @param batches - Array of batches to process
 * @param delayMs - Delay in milliseconds between batches
 * @returns Promise that resolves when all batches are processed
 */
export async function processBatchesSequentially<T>(
  batches: T[][],
  delayMs: number
): Promise<T[][]> {
  if (!Array.isArray(batches)) {
    throw new Error('Batches must be an array');
  }

  if (delayMs < 0) {
    throw new Error('Delay must be non-negative');
  }

  logger.info(
    {
      totalBatches: batches.length,
      delayMs,
      estimatedTimeMs: batches.length * delayMs,
    },
    'Starting sequential batch processing'
  );

  const results: T[][] = [];

  for (let i = 0; i < batches.length; i++) {
    logger.debug(
      {
        batchIndex: i,
        batchSize: batches[i].length,
        remainingBatches: batches.length - i - 1,
      },
      'Processing batch'
    );

    results.push(batches[i]);

    // Add delay between batches (except after the last one)
    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.info(
    {
      totalBatches: batches.length,
      totalItems: results.flat().length,
    },
    'Completed sequential batch processing'
  );

  return results;
}

/**
 * Chunk array into smaller arrays
 * Alias for createBatches with consistent naming
 * @param array - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  return createBatches(array, size);
}

/**
 * Get all pages from an array
 * @param items - Array of items to paginate
 * @param pageSize - Number of items per page
 * @returns Array of pages
 */
export function getAllPages<T>(items: T[], pageSize: number): T[][] {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }

  if (pageSize <= 0) {
    throw new Error('Page size must be greater than 0');
  }

  const pages: T[][] = [];
  const totalPages = Math.ceil(items.length / pageSize);

  for (let i = 1; i <= totalPages; i++) {
    pages.push(paginate(items, pageSize, i));
  }

  logger.info(
    {
      totalItems: items.length,
      pageSize,
      totalPages,
    },
    'Generated all pages'
  );

  return pages;
}

/**
 * Pagination metadata
 */
export interface PaginationMetadata {
  totalItems: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

/**
 * Get pagination metadata
 * @param items - Array of items
 * @param pageSize - Number of items per page
 * @param pageNumber - Current page number (1-indexed)
 * @returns Pagination metadata
 */
export function getPaginationMetadata<T>(
  items: T[],
  pageSize: number,
  pageNumber: number
): PaginationMetadata {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }

  if (pageSize <= 0) {
    throw new Error('Page size must be greater than 0');
  }

  if (pageNumber <= 0) {
    throw new Error('Page number must be greater than 0');
  }

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (pageNumber - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    totalItems,
    pageSize,
    currentPage: pageNumber,
    totalPages,
    hasNextPage: pageNumber < totalPages,
    hasPreviousPage: pageNumber > 1,
    startIndex,
    endIndex,
  };
}

/**
 * Paginated result with metadata
 */
export interface PaginatedResult<T> {
  items: T[];
  metadata: PaginationMetadata;
}

/**
 * Paginate with metadata
 * @param items - Array of items to paginate
 * @param pageSize - Number of items per page
 * @param pageNumber - Page number (1-indexed)
 * @returns Paginated items with metadata
 */
export function paginateWithMetadata<T>(
  items: T[],
  pageSize: number,
  pageNumber: number
): PaginatedResult<T> {
  return {
    items: paginate(items, pageSize, pageNumber),
    metadata: getPaginationMetadata(items, pageSize, pageNumber),
  };
}

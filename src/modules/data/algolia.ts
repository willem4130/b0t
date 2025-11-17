import { algoliasearch } from 'algoliasearch';
import type { Algoliasearch } from 'algoliasearch';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY;
const ALGOLIA_INDEX_NAME = process.env.ALGOLIA_INDEX_NAME;

if (!ALGOLIA_APP_ID || !ALGOLIA_API_KEY) {
  logger.warn('⚠️  ALGOLIA_APP_ID or ALGOLIA_API_KEY not set.');
}

let algoliaClient: Algoliasearch | null = null;

if (ALGOLIA_APP_ID && ALGOLIA_API_KEY) {
  algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
}

const algoliaRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 50,
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 5 * 1000,
  id: 'algolia',
});

export interface AlgoliaSearchOptions {
  indexName?: string;
  query: string;
  hitsPerPage?: number;
  page?: number;
  filters?: string;
}

function getIndexName(indexName?: string): string {
  if (indexName) {
    return indexName;
  }
  if (!ALGOLIA_INDEX_NAME) {
    throw new Error('No Algolia index specified. Provide indexName or set ALGOLIA_INDEX_NAME.');
  }
  return ALGOLIA_INDEX_NAME;
}

async function searchInternal(options: AlgoliaSearchOptions) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const indexName = getIndexName(options.indexName);
  logger.info({ query: options.query, indexName }, 'Searching Algolia index');
  const result = await algoliaClient.search({
    requests: [
      {
        indexName,
        query: options.query,
        hitsPerPage: options.hitsPerPage,
        page: options.page,
        filters: options.filters,
      },
    ],
  });
  const searchResult = result.results[0];
  // @ts-expect-error - nbHits exists on SearchResponse but not on union type
  logger.info({ nbHits: searchResult?.nbHits || 0 }, 'Algolia search completed');
  return searchResult;
}

const searchWithBreaker = createCircuitBreaker(searchInternal, {
  timeout: 10000,
  name: 'algolia-search',
});

const searchRateLimited = withRateLimit(
  async (options: AlgoliaSearchOptions) => searchWithBreaker.fire(options),
  algoliaRateLimiter
);

export async function search(options: AlgoliaSearchOptions) {
  return await searchRateLimited(options);
}

export async function addObject(object: Record<string, unknown>, indexName?: string) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const index = getIndexName(indexName);
  logger.info({ indexName: index }, 'Adding object to Algolia');
  const result = await algoliaClient.saveObject({
    indexName: index,
    body: object,
  });
  logger.info({ taskID: result.taskID }, 'Object added');
  return { taskID: result.taskID };
}

export async function updateObject(objectID: string, updates: Record<string, unknown>, indexName?: string) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const index = getIndexName(indexName);
  logger.info({ objectID, indexName: index }, 'Updating object');
  const result = await algoliaClient.partialUpdateObject({
    indexName: index,
    objectID,
    attributesToUpdate: updates,
  });
  return { taskID: result.taskID };
}

export async function deleteObject(objectID: string, indexName?: string) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const index = getIndexName(indexName);
  logger.info({ objectID, indexName: index }, 'Deleting object');
  await algoliaClient.deleteObject({
    indexName: index,
    objectID,
  });
}

export async function batchAddObjects(objects: Record<string, unknown>[], indexName?: string) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const index = getIndexName(indexName);
  logger.info({ objectCount: objects.length, indexName: index }, 'Batch adding objects');
  const result = await algoliaClient.saveObjects({
    indexName: index,
    objects,
  });
  return { taskID: result[0]?.taskID };
}

export async function clearIndex(indexName?: string) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const index = getIndexName(indexName);
  logger.info({ indexName: index }, 'Clearing index');
  await algoliaClient.clearObjects({
    indexName: index,
  });
}

export async function setSettings(settings: Record<string, unknown>, indexName?: string) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const index = getIndexName(indexName);
  logger.info({ indexName: index }, 'Setting index settings');
  await algoliaClient.setSettings({
    indexName: index,
    indexSettings: settings,
  });
}

export async function getSettings(indexName?: string) {
  if (!algoliaClient) {
    throw new Error('Algolia client not initialized.');
  }
  const index = getIndexName(indexName);
  logger.info({ indexName: index }, 'Getting index settings');
  return await algoliaClient.getSettings({
    indexName: index,
  });
}

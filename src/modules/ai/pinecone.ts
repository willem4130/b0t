/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import { Pinecone } from '@pinecone-database/pinecone';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Pinecone Vector Database Module
 *
 * Vector database for semantic search and similarity matching.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (100 requests/min)
 * - Structured logging
 * - 30s timeout for vector operations
 *
 * Use cases:
 * - Semantic search over documents
 * - Similarity matching
 * - Recommendation systems
 * - RAG (Retrieval Augmented Generation)
 */

if (!process.env.PINECONE_API_KEY) {
  logger.warn('⚠️  PINECONE_API_KEY is not set. Pinecone features will not work.');
}

// Initialize Pinecone client
let pineconeClient: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!pineconeClient && process.env.PINECONE_API_KEY) {
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }
  if (!pineconeClient) {
    throw new Error('Pinecone API key not configured');
  }
  return pineconeClient;
}

// Rate limiter: 100 requests per minute
const pineconeRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 600, // 600ms between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'pinecone-api',
});

interface PineconeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

interface QueryResult {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Upsert vectors into Pinecone index
 *
 * @param indexName - Name of the Pinecone index
 * @param vectors - Array of vectors to upsert
 * @param namespace - Optional namespace for organization
 * @returns Object with upsertedCount
 */
async function upsertVectorsInternal(
  indexName: string,
  vectors: PineconeVector[],
  namespace?: string
): Promise<{ upsertedCount: number }> {
  logger.info({ indexName, vectorCount: vectors.length, namespace }, 'Upserting vectors to Pinecone');

  const client = getPineconeClient();
  const index = client.index(indexName);

  const result = await index.namespace(namespace || '').upsert(vectors);

  logger.info({ upsertedCount: result.upsertedCount }, 'Vectors upserted successfully');
  return { upsertedCount: result.upsertedCount };
}

const upsertVectorsWithBreaker = createCircuitBreaker(upsertVectorsInternal, {
  timeout: 30000,
  name: 'pinecone:upsertVectors',
});

/**
 * Upsert vectors into Pinecone index (protected)
 */
export const upsertVectors = withRateLimit(
  (indexName: string, vectors: PineconeVector[], namespace?: string) =>
    upsertVectorsWithBreaker.fire(indexName, vectors, namespace),
  pineconeRateLimiter
);

/**
 * Query vectors from Pinecone index
 *
 * @param indexName - Name of the Pinecone index
 * @param vector - Query vector
 * @param topK - Number of results to return (default: 10)
 * @param namespace - Optional namespace
 * @param filter - Optional metadata filter
 * @returns Array of query results with scores
 */
async function queryVectorsInternal(
  indexName: string,
  vector: number[],
  topK: number = 10,
  namespace?: string,
  filter?: Record<string, string | number | boolean>
): Promise<QueryResult[]> {
  logger.info({ indexName, topK, namespace, hasFilter: !!filter }, 'Querying vectors from Pinecone');

  const client = getPineconeClient();
  const index = client.index(indexName);

  const queryRequest: {
    vector: number[];
    topK: number;
    includeMetadata: boolean;
    filter?: Record<string, string | number | boolean>;
  } = {
    vector,
    topK,
    includeMetadata: true,
  };

  if (filter) {
    queryRequest.filter = filter;
  }

  const result = await index.namespace(namespace || '').query(queryRequest);

  const matches = result.matches?.map(match => ({
    id: match.id,
    score: match.score || 0,
    metadata: match.metadata as Record<string, string | number | boolean> | undefined,
  })) || [];

  logger.info({ matchCount: matches.length }, 'Query completed successfully');
  return matches;
}

const queryVectorsWithBreaker = createCircuitBreaker(queryVectorsInternal, {
  timeout: 30000,
  name: 'pinecone:queryVectors',
});

/**
 * Query vectors from Pinecone index (protected)
 */
export const queryVectors = withRateLimit(
  (
    indexName: string,
    vector: number[],
    topK?: number,
    namespace?: string,
    filter?: Record<string, string | number | boolean>
  ) => queryVectorsWithBreaker.fire(indexName, vector, topK, namespace, filter),
  pineconeRateLimiter
);

/**
 * Delete vectors from Pinecone index
 *
 * @param indexName - Name of the Pinecone index
 * @param ids - Array of vector IDs to delete
 * @param namespace - Optional namespace
 * @returns Success status
 */
async function deleteVectorsInternal(
  indexName: string,
  ids: string[],
  namespace?: string
): Promise<{ success: boolean; deletedCount: number }> {
  logger.info({ indexName, idCount: ids.length, namespace }, 'Deleting vectors from Pinecone');

  const client = getPineconeClient();
  const index = client.index(indexName);

  await index.namespace(namespace || '').deleteMany(ids);

  logger.info({ deletedCount: ids.length }, 'Vectors deleted successfully');
  return { success: true, deletedCount: ids.length };
}

const deleteVectorsWithBreaker = createCircuitBreaker(deleteVectorsInternal, {
  timeout: 30000,
  name: 'pinecone:deleteVectors',
});

/**
 * Delete vectors from Pinecone index (protected)
 */
export const deleteVectors = withRateLimit(
  (indexName: string, ids: string[], namespace?: string) =>
    deleteVectorsWithBreaker.fire(indexName, ids, namespace),
  pineconeRateLimiter
);

/**
 * Delete all vectors in a namespace
 *
 * @param indexName - Name of the Pinecone index
 * @param namespace - Namespace to delete
 * @returns Success status
 */
async function deleteNamespaceInternal(
  indexName: string,
  namespace: string
): Promise<{ success: boolean }> {
  logger.info({ indexName, namespace }, 'Deleting namespace from Pinecone');

  const client = getPineconeClient();
  const index = client.index(indexName);

  await index.namespace(namespace).deleteAll();

  logger.info('Namespace deleted successfully');
  return { success: true };
}

const deleteNamespaceWithBreaker = createCircuitBreaker(deleteNamespaceInternal, {
  timeout: 30000,
  name: 'pinecone:deleteNamespace',
});

/**
 * Delete all vectors in a namespace (protected)
 */
export const deleteNamespace = withRateLimit(
  (indexName: string, namespace: string) => deleteNamespaceWithBreaker.fire(indexName, namespace),
  pineconeRateLimiter
);

/**
 * List all indexes
 *
 * @returns Array of index names
 */
async function listIndexesInternal(): Promise<{ indexes: string[] }> {
  logger.info('Listing Pinecone indexes');

  const client = getPineconeClient();
  const indexes = await client.listIndexes();

  const indexNames = indexes.indexes?.map(idx => idx.name) || [];

  logger.info({ indexCount: indexNames.length }, 'Indexes listed successfully');
  return { indexes: indexNames };
}

const listIndexesWithBreaker = createCircuitBreaker(listIndexesInternal, {
  timeout: 30000,
  name: 'pinecone:listIndexes',
});

/**
 * List all indexes (protected)
 */
export const listIndexes = withRateLimit(
  () => listIndexesWithBreaker.fire(),
  pineconeRateLimiter
);

/**
 * Get index statistics
 *
 * @param indexName - Name of the Pinecone index
 * @returns Index statistics including vector count and dimension
 */
async function getIndexStatsInternal(
  indexName: string
): Promise<{
  dimension?: number;
  indexFullness?: number;
  totalVectorCount?: number;
  namespaces?: Record<string, { vectorCount?: number }>;
}> {
  logger.info({ indexName }, 'Getting Pinecone index stats');

  const client = getPineconeClient();
  const index = client.index(indexName);

  const stats = await index.describeIndexStats();

  logger.info({ stats }, 'Index stats retrieved successfully');
  return {
    dimension: stats.dimension,
    indexFullness: stats.indexFullness,
    totalVectorCount: stats.totalVectorCount,
    namespaces: stats.namespaces,
  };
}

const getIndexStatsWithBreaker = createCircuitBreaker(getIndexStatsInternal, {
  timeout: 30000,
  name: 'pinecone:getIndexStats',
});

/**
 * Get index statistics (protected)
 */
export const getIndexStats = withRateLimit(
  (indexName: string) => getIndexStatsWithBreaker.fire(indexName),
  pineconeRateLimiter
);

/**
 * Fetch vectors by IDs
 *
 * @param indexName - Name of the Pinecone index
 * @param ids - Array of vector IDs to fetch
 * @param namespace - Optional namespace
 * @returns Map of vector IDs to vectors
 */
async function fetchVectorsInternal(
  indexName: string,
  ids: string[],
  namespace?: string
): Promise<Record<string, PineconeVector>> {
  logger.info({ indexName, idCount: ids.length, namespace }, 'Fetching vectors from Pinecone');

  const client = getPineconeClient();
  const index = client.index(indexName);

  const result = await index.namespace(namespace || '').fetch(ids);

  const vectors: Record<string, PineconeVector> = {};
  if (result.records) {
    for (const [id, record] of Object.entries(result.records)) {
      vectors[id] = {
        id,
        values: record.values || [],
        metadata: record.metadata as Record<string, string | number | boolean> | undefined,
      };
    }
  }

  logger.info({ fetchedCount: Object.keys(vectors).length }, 'Vectors fetched successfully');
  return vectors;
}

const fetchVectorsWithBreaker = createCircuitBreaker(fetchVectorsInternal, {
  timeout: 30000,
  name: 'pinecone:fetchVectors',
});

/**
 * Fetch vectors by IDs (protected)
 */
export const fetchVectors = withRateLimit(
  (indexName: string, ids: string[], namespace?: string) =>
    fetchVectorsWithBreaker.fire(indexName, ids, namespace),
  pineconeRateLimiter
);

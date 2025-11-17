/* eslint-disable */
import { ChromaClient, Collection } from 'chromadb';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * ChromaDB Vector Database Module
 *
 * Open-source vector database for AI applications.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (100 requests/min)
 * - Structured logging
 * - 30s timeout for operations
 *
 * Use cases:
 * - Document storage and retrieval
 * - Semantic search
 * - Knowledge bases
 * - Chat history storage
 */

// Initialize Chroma client
let chromaClient: ChromaClient | null = null;

function getChromaClient(): ChromaClient {
  if (!chromaClient) {
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    chromaClient = new ChromaClient({
      path: chromaUrl,
    });
    logger.info({ chromaUrl }, 'ChromaDB client initialized');
  }
  return chromaClient;
}

// Rate limiter: 100 requests per minute
const chromaRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 600,
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000,
  id: 'chroma-api',
});

interface ChromaDocument {
  id: string;
  document: string;
  metadata?: Record<string, string | number | boolean>;
  embedding?: number[];
}

interface ChromaQueryResult {
  ids: string[];
  distances: number[];
  documents: string[];
  metadatas: (Record<string, string | number | boolean> | null)[];
}

/**
 * Create or get a collection
 *
 * @param collectionName - Name of the collection
 * @param metadata - Optional collection metadata
 * @returns Collection object
 */
async function getOrCreateCollectionInternal(
  collectionName: string,
  metadata?: Record<string, string | number>
): Promise<{ name: string; id: string }> {
  logger.info({ collectionName, metadata }, 'Getting or creating Chroma collection');

  const client = getChromaClient();
  const collection = await client.getOrCreateCollection({
    name: collectionName,
    metadata: metadata || {},
  });

  logger.info({ collectionName, id: collection.id }, 'Collection ready');
  return { name: collection.name, id: collection.id };
}

const getOrCreateCollectionWithBreaker = createCircuitBreaker(getOrCreateCollectionInternal, {
  timeout: 30000,
  name: 'chroma:getOrCreateCollection',
});

/**
 * Create or get a collection (protected)
 */
export const getOrCreateCollection = withRateLimit(
  (collectionName: string, metadata?: Record<string, string | number>) =>
    getOrCreateCollectionWithBreaker.fire(collectionName, metadata),
  chromaRateLimiter
);

/**
 * Add documents to a collection
 *
 * @param collectionName - Name of the collection
 * @param documents - Array of documents to add
 * @returns Object with added count
 */
async function addDocumentsInternal(
  collectionName: string,
  documents: ChromaDocument[]
): Promise<{ addedCount: number }> {
  logger.info({ collectionName, documentCount: documents.length }, 'Adding documents to Chroma');

  const client = getChromaClient();
  const collection = await client.getCollection({ name: collectionName });

  await collection.add({
    ids: documents.map(d => d.id),
    documents: documents.map(d => d.document),
    metadatas: documents.map(d => d.metadata || {}),
    embeddings: documents.some(d => d.embedding)
      ? documents.map(d => d.embedding || [])
      : undefined,
  });

  logger.info({ addedCount: documents.length }, 'Documents added successfully');
  return { addedCount: documents.length };
}

const addDocumentsWithBreaker = createCircuitBreaker(addDocumentsInternal, {
  timeout: 30000,
  name: 'chroma:addDocuments',
});

/**
 * Add documents to a collection (protected)
 */
export const addDocuments = withRateLimit(
  (collectionName: string, documents: ChromaDocument[]) =>
    addDocumentsWithBreaker.fire(collectionName, documents),
  chromaRateLimiter
);

/**
 * Query documents from a collection
 *
 * @param collectionName - Name of the collection
 * @param queryTexts - Array of query texts
 * @param nResults - Number of results per query (default: 10)
 * @param where - Optional metadata filter
 * @returns Query results with IDs, distances, documents, and metadata
 */
async function queryDocumentsInternal(
  collectionName: string,
  queryTexts: string[],
  nResults: number = 10,
  where?: Record<string, string | number | boolean>
): Promise<ChromaQueryResult> {
  logger.info({ collectionName, queryCount: queryTexts.length, nResults }, 'Querying Chroma documents');

  const client = getChromaClient();
  const collection = await client.getCollection({ name: collectionName });

  const queryOptions: {
    queryTexts: string[];
    nResults: number;
    where?: Record<string, string | number | boolean>;
  } = {
    queryTexts,
    nResults,
  };

  if (where) {
    queryOptions.where = where;
  }

  const result = await collection.query(queryOptions);

  logger.info({ resultCount: result.ids.length }, 'Query completed successfully');

  return {
    ids: result.ids.flat(),
    // @ts-ignore - chromadb types may include null but we filter them
    distances: result.distances?.flat().filter((d): d is number => d !== null) || [],
    documents: (result.documents?.flat() || []).filter((d): d is string => d !== null),
    // @ts-ignore - chromadb metadata types are more flexible than our return type
    metadatas: result.metadatas?.flat() || [],
  };
}

const queryDocumentsWithBreaker = createCircuitBreaker(queryDocumentsInternal, {
  timeout: 30000,
  name: 'chroma:queryDocuments',
});

/**
 * Query documents from a collection (protected)
 */
export const queryDocuments = withRateLimit(
  (
    collectionName: string,
    queryTexts: string[],
    nResults?: number,
    where?: Record<string, string | number | boolean>
  ) => queryDocumentsWithBreaker.fire(collectionName, queryTexts, nResults, where),
  chromaRateLimiter
);

/**
 * Delete documents from a collection
 *
 * @param collectionName - Name of the collection
 * @param ids - Array of document IDs to delete
 * @returns Object with deleted count
 */
async function deleteDocumentsInternal(
  collectionName: string,
  ids: string[]
): Promise<{ deletedCount: number }> {
  logger.info({ collectionName, idCount: ids.length }, 'Deleting documents from Chroma');

  const client = getChromaClient();
  const collection = await client.getCollection({ name: collectionName });

  await collection.delete({ ids });

  logger.info({ deletedCount: ids.length }, 'Documents deleted successfully');
  return { deletedCount: ids.length };
}

const deleteDocumentsWithBreaker = createCircuitBreaker(deleteDocumentsInternal, {
  timeout: 30000,
  name: 'chroma:deleteDocuments',
});

/**
 * Delete documents from a collection (protected)
 */
export const deleteDocuments = withRateLimit(
  (collectionName: string, ids: string[]) => deleteDocumentsWithBreaker.fire(collectionName, ids),
  chromaRateLimiter
);

/**
 * Get documents by IDs
 *
 * @param collectionName - Name of the collection
 * @param ids - Array of document IDs to fetch
 * @returns Documents with metadata
 */
async function getDocumentsInternal(
  collectionName: string,
  ids: string[]
): Promise<{
  ids: string[];
  documents: string[];
  metadatas: (Record<string, string | number | boolean> | null)[];
}> {
  logger.info({ collectionName, idCount: ids.length }, 'Getting documents from Chroma');

  const client = getChromaClient();
  const collection = await client.getCollection({ name: collectionName });

  const result = await collection.get({ ids });

  logger.info({ fetchedCount: result.ids.length }, 'Documents fetched successfully');

  return {
    ids: result.ids,
    documents: (result.documents || []).filter((d): d is string => d !== null),
    // @ts-ignore - chromadb metadata types are more flexible than our return type
    metadatas: result.metadatas || [],
  };
}

const getDocumentsWithBreaker = createCircuitBreaker(getDocumentsInternal, {
  timeout: 30000,
  name: 'chroma:getDocuments',
});

/**
 * Get documents by IDs (protected)
 */
export const getDocuments = withRateLimit(
  (collectionName: string, ids: string[]) => getDocumentsWithBreaker.fire(collectionName, ids),
  chromaRateLimiter
);

/**
 * Update documents in a collection
 *
 * @param collectionName - Name of the collection
 * @param documents - Array of documents to update
 * @returns Object with updated count
 */
async function updateDocumentsInternal(
  collectionName: string,
  documents: ChromaDocument[]
): Promise<{ updatedCount: number }> {
  logger.info({ collectionName, documentCount: documents.length }, 'Updating documents in Chroma');

  const client = getChromaClient();
  const collection = await client.getCollection({ name: collectionName });

  await collection.update({
    ids: documents.map(d => d.id),
    documents: documents.map(d => d.document),
    metadatas: documents.map(d => d.metadata || {}),
    embeddings: documents.some(d => d.embedding)
      ? documents.map(d => d.embedding || [])
      : undefined,
  });

  logger.info({ updatedCount: documents.length }, 'Documents updated successfully');
  return { updatedCount: documents.length };
}

const updateDocumentsWithBreaker = createCircuitBreaker(updateDocumentsInternal, {
  timeout: 30000,
  name: 'chroma:updateDocuments',
});

/**
 * Update documents in a collection (protected)
 */
export const updateDocuments = withRateLimit(
  (collectionName: string, documents: ChromaDocument[]) =>
    updateDocumentsWithBreaker.fire(collectionName, documents),
  chromaRateLimiter
);

/**
 * List all collections
 *
 * @returns Array of collection names
 */
async function listCollectionsInternal(): Promise<{ collections: string[] }> {
  logger.info('Listing Chroma collections');

  const client = getChromaClient();
  const collections = await client.listCollections();

  const collectionNames = collections.map(c => c.name);

  logger.info({ collectionCount: collectionNames.length }, 'Collections listed successfully');
  return { collections: collectionNames };
}

const listCollectionsWithBreaker = createCircuitBreaker(listCollectionsInternal, {
  timeout: 30000,
  name: 'chroma:listCollections',
});

/**
 * List all collections (protected)
 */
export const listCollections = withRateLimit(
  () => listCollectionsWithBreaker.fire(),
  chromaRateLimiter
);

/**
 * Delete a collection
 *
 * @param collectionName - Name of the collection to delete
 * @returns Success status
 */
async function deleteCollectionInternal(collectionName: string): Promise<{ success: boolean }> {
  logger.info({ collectionName }, 'Deleting Chroma collection');

  const client = getChromaClient();
  await client.deleteCollection({ name: collectionName });

  logger.info('Collection deleted successfully');
  return { success: true };
}

const deleteCollectionWithBreaker = createCircuitBreaker(deleteCollectionInternal, {
  timeout: 30000,
  name: 'chroma:deleteCollection',
});

/**
 * Delete a collection (protected)
 */
export const deleteCollection = withRateLimit(
  (collectionName: string) => deleteCollectionWithBreaker.fire(collectionName),
  chromaRateLimiter
);

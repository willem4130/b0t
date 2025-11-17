/* eslint-disable */
import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Weaviate Vector Database Module
 *
 * Enterprise-grade vector database with GraphQL API.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (100 requests/min)
 * - Structured logging
 * - 30s timeout for operations
 *
 * Use cases:
 * - Enterprise search
 * - Semantic knowledge graphs
 * - Recommendation systems
 * - Multi-modal search
 */

if (!process.env.WEAVIATE_URL) {
  logger.warn('⚠️  WEAVIATE_URL is not set. Weaviate features will not work.');
}

// Initialize Weaviate client
let weaviateClient: WeaviateClient | null = null;

function getWeaviateClient(): WeaviateClient {
  if (!weaviateClient) {
    const weaviateUrl = process.env.WEAVIATE_URL || 'http://localhost:8080';
    const weaviateApiKey = process.env.WEAVIATE_API_KEY;

    const clientConfig: {
      scheme: string;
      host: string;
      apiKey?: ApiKey;
    } = {
      scheme: weaviateUrl.startsWith('https') ? 'https' : 'http',
      host: weaviateUrl.replace(/^https?:\/\//, ''),
    };

    if (weaviateApiKey) {
      clientConfig.apiKey = new ApiKey(weaviateApiKey);
    }

    weaviateClient = weaviate.client(clientConfig);
    logger.info({ weaviateUrl }, 'Weaviate client initialized');
  }
  return weaviateClient;
}

// Rate limiter: 100 requests per minute
const weaviateRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 600,
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000,
  id: 'weaviate-api',
});

interface WeaviateObject {
  class: string;
  properties: Record<string, unknown>;
  id?: string;
  vector?: number[];
}

interface WeaviateQueryResult {
  data: {
    Get: Record<string, unknown[]>;
  };
}

/**
 * Create a new object in Weaviate
 *
 * @param className - Name of the class
 * @param properties - Object properties
 * @param vector - Optional vector
 * @returns Created object with ID
 */
async function createObjectInternal(
  className: string,
  properties: Record<string, unknown>,
  vector?: number[]
): Promise<{ id: string; class: string }> {
  logger.info({ className, propertiesKeys: Object.keys(properties) }, 'Creating Weaviate object');

  const client = getWeaviateClient();

  const objectData: {
    class: string;
    properties: Record<string, unknown>;
    vector?: number[];
  } = {
    class: className,
    properties,
  };

  if (vector) {
    objectData.vector = vector;
  }

  const result = await client.data.creator().withClassName(className).withProperties(properties).do();

  logger.info({ id: result.id }, 'Object created successfully');
  return { id: result.id || '', class: className };
}

const createObjectWithBreaker = createCircuitBreaker(createObjectInternal, {
  timeout: 30000,
  name: 'weaviate:createObject',
});

/**
 * Create a new object in Weaviate (protected)
 */
export const createObject = withRateLimit(
  (className: string, properties: Record<string, unknown>, vector?: number[]) =>
    createObjectWithBreaker.fire(className, properties, vector),
  weaviateRateLimiter
);

/**
 * Query objects from Weaviate
 *
 * @param className - Name of the class
 * @param fields - Fields to retrieve
 * @param limit - Maximum number of results (default: 10)
 * @param nearVector - Optional vector for similarity search
 * @param where - Optional where filter
 * @returns Query results
 */
async function queryObjectsInternal(
  className: string,
  fields: string[],
  limit: number = 10,
  nearVector?: number[],
  where?: Record<string, unknown>
): Promise<unknown[]> {
  logger.info({ className, fields, limit, hasNearVector: !!nearVector }, 'Querying Weaviate objects');

  const client = getWeaviateClient();

  let query = client.graphql.get().withClassName(className).withFields(fields.join(' ')).withLimit(limit);

  if (nearVector) {
    query = query.withNearVector({ vector: nearVector });
  }

  if (where) {
    query = query.withWhere(where);
  }

  const result = await query.do();

  const objects = (result as WeaviateQueryResult).data?.Get?.[className] || [];

  logger.info({ resultCount: objects.length }, 'Query completed successfully');
  return objects;
}

const queryObjectsWithBreaker = createCircuitBreaker(queryObjectsInternal, {
  timeout: 30000,
  name: 'weaviate:queryObjects',
});

/**
 * Query objects from Weaviate (protected)
 */
export const queryObjects = withRateLimit(
  (
    className: string,
    fields: string[],
    limit?: number,
    nearVector?: number[],
    where?: Record<string, unknown>
  ) => queryObjectsWithBreaker.fire(className, fields, limit, nearVector, where),
  weaviateRateLimiter
);

/**
 * Delete an object from Weaviate
 *
 * @param className - Name of the class
 * @param id - Object ID to delete
 * @returns Success status
 */
async function deleteObjectInternal(className: string, id: string): Promise<{ success: boolean }> {
  logger.info({ className, id }, 'Deleting Weaviate object');

  const client = getWeaviateClient();
  await client.data.deleter().withClassName(className).withId(id).do();

  logger.info('Object deleted successfully');
  return { success: true };
}

const deleteObjectWithBreaker = createCircuitBreaker(deleteObjectInternal, {
  timeout: 30000,
  name: 'weaviate:deleteObject',
});

/**
 * Delete an object from Weaviate (protected)
 */
export const deleteObject = withRateLimit(
  (className: string, id: string) => deleteObjectWithBreaker.fire(className, id),
  weaviateRateLimiter
);

/**
 * Update an object in Weaviate
 *
 * @param className - Name of the class
 * @param id - Object ID to update
 * @param properties - Updated properties
 * @returns Success status
 */
async function updateObjectInternal(
  className: string,
  id: string,
  properties: Record<string, unknown>
): Promise<{ success: boolean }> {
  logger.info({ className, id, propertiesKeys: Object.keys(properties) }, 'Updating Weaviate object');

  const client = getWeaviateClient();
  await client.data.updater().withClassName(className).withId(id).withProperties(properties).do();

  logger.info('Object updated successfully');
  return { success: true };
}

const updateObjectWithBreaker = createCircuitBreaker(updateObjectInternal, {
  timeout: 30000,
  name: 'weaviate:updateObject',
});

/**
 * Update an object in Weaviate (protected)
 */
export const updateObject = withRateLimit(
  (className: string, id: string, properties: Record<string, unknown>) =>
    updateObjectWithBreaker.fire(className, id, properties),
  weaviateRateLimiter
);

/**
 * Get object by ID
 *
 * @param className - Name of the class
 * @param id - Object ID
 * @returns Object data
 */
async function getObjectByIdInternal(
  className: string,
  id: string
): Promise<{ id: string; properties: Record<string, unknown> }> {
  logger.info({ className, id }, 'Getting Weaviate object by ID');

  const client = getWeaviateClient();
  const result = await client.data.getterById().withClassName(className).withId(id).do();

  logger.info('Object fetched successfully');
  return {
    id: result.id || '',
    properties: result.properties || {},
  };
}

const getObjectByIdWithBreaker = createCircuitBreaker(getObjectByIdInternal, {
  timeout: 30000,
  name: 'weaviate:getObjectById',
});

/**
 * Get object by ID (protected)
 */
export const getObjectById = withRateLimit(
  (className: string, id: string) => getObjectByIdWithBreaker.fire(className, id),
  weaviateRateLimiter
);

/**
 * Get schema for a class
 *
 * @param className - Name of the class (optional - returns all if not provided)
 * @returns Schema information
 */
async function getSchemaInternal(className?: string): Promise<unknown> {
  logger.info({ className }, 'Getting Weaviate schema');

  const client = getWeaviateClient();

  if (className) {
    const result = await client.schema.classGetter().withClassName(className).do();
    logger.info('Schema fetched successfully');
    return result;
  } else {
    const result = await client.schema.getter().do();
    logger.info('Full schema fetched successfully');
    return result;
  }
}

const getSchemaWithBreaker = createCircuitBreaker(getSchemaInternal, {
  timeout: 30000,
  name: 'weaviate:getSchema',
});

/**
 * Get schema for a class (protected)
 */
export const getSchema = withRateLimit(
  (className?: string) => getSchemaWithBreaker.fire(className),
  weaviateRateLimiter
);

/**
 * Create a new class in schema
 *
 * @param classObj - Class definition object
 * @returns Created class
 */
async function createClassInternal(classObj: {
  class: string;
  properties: Array<{
    name: string;
    dataType: string[];
    description?: string;
  }>;
  vectorizer?: string;
  description?: string;
}): Promise<{ success: boolean; className: string }> {
  logger.info({ className: classObj.class }, 'Creating Weaviate class');

  const client = getWeaviateClient();
  await client.schema.classCreator().withClass(classObj).do();

  logger.info('Class created successfully');
  return { success: true, className: classObj.class };
}

const createClassWithBreaker = createCircuitBreaker(createClassInternal, {
  timeout: 30000,
  name: 'weaviate:createClass',
});

/**
 * Create a new class in schema (protected)
 */
export const createClass = withRateLimit(
  (classObj: {
    class: string;
    properties: Array<{
      name: string;
      dataType: string[];
      description?: string;
    }>;
    vectorizer?: string;
    description?: string;
  }) => createClassWithBreaker.fire(classObj),
  weaviateRateLimiter
);

/**
 * Delete a class from schema
 *
 * @param className - Name of the class to delete
 * @returns Success status
 */
async function deleteClassInternal(className: string): Promise<{ success: boolean }> {
  logger.info({ className }, 'Deleting Weaviate class');

  const client = getWeaviateClient();
  await client.schema.classDeleter().withClassName(className).do();

  logger.info('Class deleted successfully');
  return { success: true };
}

const deleteClassWithBreaker = createCircuitBreaker(deleteClassInternal, {
  timeout: 30000,
  name: 'weaviate:deleteClass',
});

/**
 * Delete a class from schema (protected)
 */
export const deleteClass = withRateLimit(
  (className: string) => deleteClassWithBreaker.fire(className),
  weaviateRateLimiter
);

import { MongoClient, Db, Collection, Document, Filter, UpdateFilter, OptionalId } from 'mongodb';
import { logger } from '@/lib/logger';

/**
 * MongoDB Module
 *
 * Connect and interact with MongoDB databases
 * - CRUD operations
 * - Aggregation pipelines
 * - Bulk operations
 * - Index management
 * - Connection pooling
 *
 * Perfect for:
 * - NoSQL data storage
 * - Document-based workflows
 * - Analytics pipelines
 * - Real-time data processing
 */

const clients = new Map<string, MongoClient>();

export interface MongoConnectionOptions {
  uri: string;
  database: string;
  options?: {
    maxPoolSize?: number;
    minPoolSize?: number;
    serverSelectionTimeoutMS?: number;
  };
}

export interface MongoQueryOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  projection?: Record<string, 0 | 1>;
}

/**
 * Get or create MongoDB client
 */
async function getClient(connectionString: string): Promise<MongoClient> {
  if (clients.has(connectionString)) {
    return clients.get(connectionString)!;
  }

  logger.info('Creating new MongoDB client');

  const client = new MongoClient(connectionString, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  clients.set(connectionString, client);

  logger.info('MongoDB client created and connected');

  return client;
}

/**
 * Get database and collection
 */
async function getCollection(
  uri: string,
  database: string,
  collectionName: string
): Promise<{ db: Db; collection: Collection<Document> }> {
  const client = await getClient(uri);
  const db = client.db(database);
  const collection = db.collection(collectionName);

  return { db, collection };
}

/**
 * Insert one document
 */
export async function insertOne(
  uri: string,
  database: string,
  collectionName: string,
  document: OptionalId<Document>
): Promise<{ insertedId: string }> {
  logger.info({ database, collection: collectionName }, 'Inserting document');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const result = await collection.insertOne(document);

    logger.info(
      {
        database,
        collection: collectionName,
        insertedId: result.insertedId,
      },
      'Document inserted'
    );

    return {
      insertedId: result.insertedId.toString(),
    };
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to insert document');
    throw new Error(
      `Failed to insert document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Insert many documents
 */
export async function insertMany(
  uri: string,
  database: string,
  collectionName: string,
  documents: OptionalId<Document>[]
): Promise<{ insertedIds: string[]; insertedCount: number }> {
  logger.info(
    {
      database,
      collection: collectionName,
      count: documents.length,
    },
    'Inserting multiple documents'
  );

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const result = await collection.insertMany(documents);

    const insertedIds = Object.values(result.insertedIds).map((id) => id.toString());

    logger.info(
      {
        database,
        collection: collectionName,
        insertedCount: result.insertedCount,
      },
      'Documents inserted'
    );

    return {
      insertedIds,
      insertedCount: result.insertedCount,
    };
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to insert documents');
    throw new Error(
      `Failed to insert documents: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Find documents
 */
export async function find(
  uri: string,
  database: string,
  collectionName: string,
  filter: Filter<Document> = {},
  options: MongoQueryOptions = {}
): Promise<Document[]> {
  logger.info(
    {
      database,
      collection: collectionName,
      filter,
      options,
    },
    'Finding documents'
  );

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    let cursor = collection.find(filter);

    if (options.sort) cursor = cursor.sort(options.sort);
    if (options.skip) cursor = cursor.skip(options.skip);
    if (options.limit) cursor = cursor.limit(options.limit);
    if (options.projection) cursor = cursor.project(options.projection);

    const documents = await cursor.toArray();

    logger.info(
      {
        database,
        collection: collectionName,
        count: documents.length,
      },
      'Documents found'
    );

    return documents;
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to find documents');
    throw new Error(
      `Failed to find documents: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Find one document
 */
export async function findOne(
  uri: string,
  database: string,
  collectionName: string,
  filter: Filter<Document>
): Promise<Document | null> {
  logger.info({ database, collection: collectionName, filter }, 'Finding one document');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const document = await collection.findOne(filter);

    logger.info(
      {
        database,
        collection: collectionName,
        found: document !== null,
      },
      'Find one completed'
    );

    return document;
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to find document');
    throw new Error(
      `Failed to find document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update one document
 */
export async function updateOne(
  uri: string,
  database: string,
  collectionName: string,
  filter: Filter<Document>,
  update: UpdateFilter<Document>
): Promise<{ modifiedCount: number; matchedCount: number }> {
  logger.info({ database, collection: collectionName, filter }, 'Updating one document');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const result = await collection.updateOne(filter, update);

    logger.info(
      {
        database,
        collection: collectionName,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      },
      'Document updated'
    );

    return {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    };
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to update document');
    throw new Error(
      `Failed to update document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update many documents
 */
export async function updateMany(
  uri: string,
  database: string,
  collectionName: string,
  filter: Filter<Document>,
  update: UpdateFilter<Document>
): Promise<{ modifiedCount: number; matchedCount: number }> {
  logger.info({ database, collection: collectionName, filter }, 'Updating multiple documents');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const result = await collection.updateMany(filter, update);

    logger.info(
      {
        database,
        collection: collectionName,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      },
      'Documents updated'
    );

    return {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    };
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to update documents');
    throw new Error(
      `Failed to update documents: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete one document
 */
export async function deleteOne(
  uri: string,
  database: string,
  collectionName: string,
  filter: Filter<Document>
): Promise<{ deletedCount: number }> {
  logger.info({ database, collection: collectionName, filter }, 'Deleting one document');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const result = await collection.deleteOne(filter);

    logger.info(
      {
        database,
        collection: collectionName,
        deletedCount: result.deletedCount,
      },
      'Document deleted'
    );

    return {
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to delete document');
    throw new Error(
      `Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete many documents
 */
export async function deleteMany(
  uri: string,
  database: string,
  collectionName: string,
  filter: Filter<Document>
): Promise<{ deletedCount: number }> {
  logger.info({ database, collection: collectionName, filter }, 'Deleting multiple documents');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const result = await collection.deleteMany(filter);

    logger.info(
      {
        database,
        collection: collectionName,
        deletedCount: result.deletedCount,
      },
      'Documents deleted'
    );

    return {
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to delete documents');
    throw new Error(
      `Failed to delete documents: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Count documents
 */
export async function count(
  uri: string,
  database: string,
  collectionName: string,
  filter: Filter<Document> = {}
): Promise<number> {
  logger.info({ database, collection: collectionName, filter }, 'Counting documents');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const count = await collection.countDocuments(filter);

    logger.info(
      {
        database,
        collection: collectionName,
        count,
      },
      'Documents counted'
    );

    return count;
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to count documents');
    throw new Error(
      `Failed to count documents: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Aggregate documents
 */
export async function aggregate(
  uri: string,
  database: string,
  collectionName: string,
  pipeline: Document[]
): Promise<Document[]> {
  logger.info(
    {
      database,
      collection: collectionName,
      pipelineStages: pipeline.length,
    },
    'Running aggregation pipeline'
  );

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const results = await collection.aggregate(pipeline).toArray();

    logger.info(
      {
        database,
        collection: collectionName,
        resultCount: results.length,
      },
      'Aggregation completed'
    );

    return results;
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to run aggregation');
    throw new Error(
      `Failed to run aggregation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create index
 */
export async function createIndex(
  uri: string,
  database: string,
  collectionName: string,
  keys: Record<string, 1 | -1>,
  options?: { unique?: boolean; name?: string }
): Promise<string> {
  logger.info({ database, collection: collectionName, keys, options }, 'Creating index');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    const indexName = await collection.createIndex(keys, options);

    logger.info(
      {
        database,
        collection: collectionName,
        indexName,
      },
      'Index created'
    );

    return indexName;
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to create index');
    throw new Error(
      `Failed to create index: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Drop collection
 */
export async function dropCollection(
  uri: string,
  database: string,
  collectionName: string
): Promise<void> {
  logger.info({ database, collection: collectionName }, 'Dropping collection');

  try {
    const { collection } = await getCollection(uri, database, collectionName);

    await collection.drop();

    logger.info({ database, collection: collectionName }, 'Collection dropped');
  } catch (error) {
    logger.error({ error, database, collection: collectionName }, 'Failed to drop collection');
    throw new Error(
      `Failed to drop collection: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Close all connections
 */
export async function closeAll(): Promise<void> {
  logger.info({ connectionCount: clients.size }, 'Closing all MongoDB connections');

  const closePromises = Array.from(clients.values()).map((client) => client.close());

  await Promise.all(closePromises);

  clients.clear();

  logger.info('All MongoDB connections closed');
}

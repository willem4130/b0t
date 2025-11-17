import { Client } from '@notionhq/client';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Notion Module
 *
 * Read, write, and manage Notion databases and pages
 * - Query databases
 * - Create pages
 * - Update page properties
 * - Retrieve page content
 * - Built-in resilience
 *
 * Perfect for:
 * - Task management automation
 * - CRM workflows
 * - Content publishing
 * - Knowledge base updates
 */

const NOTION_API_KEY = process.env.NOTION_API_KEY;

if (!NOTION_API_KEY) {
  logger.warn('⚠️  NOTION_API_KEY not set. Notion features will not work.');
}

const notionClient = NOTION_API_KEY ? new Client({ auth: NOTION_API_KEY }) : null;

// Rate limiter: Notion allows ~3 req/sec
const notionRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 350, // 350ms between requests = ~3/sec
  reservoir: 3,
  reservoirRefreshAmount: 3,
  reservoirRefreshInterval: 1000,
  id: 'notion',
});

export interface NotionDatabaseQueryOptions {
  databaseId: string;
  filter?: Record<string, unknown>;
  sorts?: Array<{
    property: string;
    direction: 'ascending' | 'descending';
  }>;
  pageSize?: number;
}

export interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, unknown>;
  createdTime: string;
  lastEditedTime: string;
}

/**
 * Internal query database function (unprotected)
 */
async function queryDatabaseInternal(
  options: NotionDatabaseQueryOptions
): Promise<NotionPage[]> {
  if (!notionClient) {
    throw new Error('Notion client not initialized. Set NOTION_API_KEY.');
  }

  logger.info(
    {
      databaseId: options.databaseId,
      hasFilter: !!options.filter,
      hasSorts: !!options.sorts,
    },
    'Querying Notion database'
  );

  const response = await (notionClient as unknown as {
    databases: {
      query: (args: {
        database_id: string;
        filter?: Record<string, unknown>;
        sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>;
        page_size?: number;
      }) => Promise<{ results: never[] }>;
    };
  }).databases.query({
    database_id: options.databaseId,
    filter: options.filter as never,
    sorts: options.sorts,
    page_size: options.pageSize || 100,
  });

  logger.info(
    { resultCount: response.results.length },
    'Notion database query completed'
  );

  return response.results.map((page: never) => ({
    id: (page as { id: string }).id,
    url: (page as { url: string }).url,
    properties: (page as { properties: Record<string, unknown> }).properties,
    createdTime: (page as { created_time: string }).created_time,
    lastEditedTime: (page as { last_edited_time: string }).last_edited_time,
  }));
}

/**
 * Query database (protected)
 */
const queryDatabaseWithBreaker = createCircuitBreaker(queryDatabaseInternal, {
  timeout: 15000,
  name: 'notion-query-database',
});

const queryDatabaseRateLimited = withRateLimit(
  async (options: NotionDatabaseQueryOptions) =>
    queryDatabaseWithBreaker.fire(options),
  notionRateLimiter
);

export async function queryDatabase(
  options: NotionDatabaseQueryOptions
): Promise<NotionPage[]> {
  return (await queryDatabaseRateLimited(options)) as unknown as NotionPage[];
}

/**
 * Create page in database
 */
export interface NotionCreatePageOptions {
  databaseId: string;
  properties: Record<string, unknown>;
  children?: Array<{
    type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3';
    content: string;
  }>;
}

export async function createPage(
  options: NotionCreatePageOptions
): Promise<NotionPage> {
  if (!notionClient) {
    throw new Error('Notion client not initialized. Set NOTION_API_KEY.');
  }

  logger.info(
    {
      databaseId: options.databaseId,
      propertyCount: Object.keys(options.properties).length,
    },
    'Creating Notion page'
  );

  const children = options.children?.map((child) => {
    if (child.type === 'paragraph') {
      return {
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [{ type: 'text' as const, text: { content: child.content } }],
        },
      };
    } else {
      return {
        object: 'block' as const,
        type: child.type,
        [child.type]: {
          rich_text: [{ type: 'text' as const, text: { content: child.content } }],
        },
      };
    }
  });

  const response = await notionClient.pages.create({
    parent: { database_id: options.databaseId },
    properties: options.properties as never,
    children: children as never,
  });

  logger.info({ pageId: response.id }, 'Notion page created');

  const pageResponse = response as {
    id: string;
    url: string;
    properties: Record<string, unknown>;
    created_time: string;
    last_edited_time: string;
  };

  return {
    id: pageResponse.id,
    url: pageResponse.url,
    properties: pageResponse.properties,
    createdTime: pageResponse.created_time,
    lastEditedTime: pageResponse.last_edited_time,
  };
}

/**
 * Update page properties
 */
export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  if (!notionClient) {
    throw new Error('Notion client not initialized. Set NOTION_API_KEY.');
  }

  logger.info(
    {
      pageId,
      propertyCount: Object.keys(properties).length,
    },
    'Updating Notion page'
  );

  const response = await notionClient.pages.update({
    page_id: pageId,
    properties: properties as never,
  });

  logger.info({ pageId: response.id }, 'Notion page updated');

  const pageResponse = response as {
    id: string;
    url: string;
    properties: Record<string, unknown>;
    created_time: string;
    last_edited_time: string;
  };

  return {
    id: pageResponse.id,
    url: pageResponse.url,
    properties: pageResponse.properties,
    createdTime: pageResponse.created_time,
    lastEditedTime: pageResponse.last_edited_time,
  };
}

/**
 * Retrieve page
 */
export async function retrievePage(pageId: string): Promise<NotionPage> {
  if (!notionClient) {
    throw new Error('Notion client not initialized. Set NOTION_API_KEY.');
  }

  logger.info({ pageId }, 'Retrieving Notion page');

  const response = await notionClient.pages.retrieve({ page_id: pageId });

  logger.info({ pageId: response.id }, 'Notion page retrieved');

  const pageResponse = response as {
    id: string;
    url: string;
    properties: Record<string, unknown>;
    created_time: string;
    last_edited_time: string;
  };

  return {
    id: pageResponse.id,
    url: pageResponse.url,
    properties: pageResponse.properties,
    createdTime: pageResponse.created_time,
    lastEditedTime: pageResponse.last_edited_time,
  };
}

/**
 * Retrieve page content (blocks)
 */
export async function retrievePageContent(
  pageId: string
): Promise<Array<{ type: string; content: string }>> {
  if (!notionClient) {
    throw new Error('Notion client not initialized. Set NOTION_API_KEY.');
  }

  logger.info({ pageId }, 'Retrieving Notion page content');

  const response = await notionClient.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });

  logger.info({ blockCount: response.results.length }, 'Notion page content retrieved');

  return response.results.map((block) => {
    const blockType = (block as { type: string }).type;
    const blockData = (block as unknown as Record<
      string,
      { rich_text?: Array<{ plain_text: string }> }
    >)[blockType];
    const content =
      blockData?.rich_text?.map((rt) => rt.plain_text).join('') || '';

    return {
      type: blockType,
      content,
    };
  });
}

/**
 * Append content to page
 */
export async function appendToPage(
  pageId: string,
  blocks: Array<{
    type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3';
    content: string;
  }>
): Promise<void> {
  if (!notionClient) {
    throw new Error('Notion client not initialized. Set NOTION_API_KEY.');
  }

  logger.info({ pageId, blockCount: blocks.length }, 'Appending to Notion page');

  const children = blocks.map((block) => {
    if (block.type === 'paragraph') {
      return {
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [{ type: 'text' as const, text: { content: block.content } }],
        },
      };
    } else {
      return {
        object: 'block' as const,
        type: block.type,
        [block.type]: {
          rich_text: [{ type: 'text' as const, text: { content: block.content } }],
        },
      };
    }
  });

  await notionClient.blocks.children.append({
    block_id: pageId,
    children: children as never,
  });

  logger.info('Content appended to Notion page');
}

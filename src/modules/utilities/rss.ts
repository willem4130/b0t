import Parser from 'rss-parser';
import { logger } from '@/lib/logger';

/**
 * RSS Parser Module
 *
 * Parse RSS and Atom feeds
 * - Fetch and parse RSS/Atom feeds
 * - Extract articles and metadata
 * - Support for custom fields
 * - Podcast feed support
 *
 * Perfect for:
 * - Content aggregation
 * - News monitoring
 * - Blog updates
 * - Podcast automation
 */

const parser = new Parser({
  customFields: {
    feed: ['subtitle', 'language'],
    item: ['summary', 'content:encoded', 'media:content'],
  },
});

export interface RssFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  enclosure?: {
    url: string;
    type?: string;
    length?: string;
  };
  [key: string]: unknown;
}

export interface RssFeed {
  title?: string;
  description?: string;
  link?: string;
  language?: string;
  lastBuildDate?: string;
  image?: {
    url: string;
    title?: string;
    link?: string;
  };
  items: RssFeedItem[];
  [key: string]: unknown;
}

/**
 * Parse RSS feed from URL
 */
export async function parseFeed(url: string): Promise<RssFeed> {
  logger.info({ url }, 'Parsing RSS feed');

  try {
    const feed = await parser.parseURL(url);

    logger.info(
      {
        url,
        title: feed.title,
        itemCount: feed.items.length,
      },
      'RSS feed parsed successfully'
    );

    return {
      title: feed.title,
      description: feed.description,
      link: feed.link,
      language: feed.language,
      lastBuildDate: (feed as { lastBuildDate?: string }).lastBuildDate,
      image: feed.image,
      items: feed.items as unknown as RssFeedItem[],
    };
  } catch (error) {
    logger.error({ error, url }, 'Failed to parse RSS feed');
    throw new Error(
      `Failed to parse RSS feed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse RSS feed from string
 */
export async function parseFeedString(feedString: string): Promise<RssFeed> {
  logger.info({ feedLength: feedString.length }, 'Parsing RSS feed from string');

  try {
    const feed = await parser.parseString(feedString);

    logger.info(
      {
        title: feed.title,
        itemCount: feed.items.length,
      },
      'RSS feed parsed from string'
    );

    return {
      title: feed.title,
      description: feed.description,
      link: feed.link,
      language: feed.language,
      lastBuildDate: (feed as { lastBuildDate?: string }).lastBuildDate,
      image: feed.image,
      items: feed.items as unknown as RssFeedItem[],
    };
  } catch (error) {
    logger.error({ error }, 'Failed to parse RSS feed from string');
    throw new Error(
      `Failed to parse RSS feed from string: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get feed items only
 */
export async function getFeedItems(url: string): Promise<RssFeedItem[]> {
  logger.info({ url }, 'Getting RSS feed items');

  try {
    const feed = await parseFeed(url);

    logger.info({ itemCount: feed.items.length }, 'RSS feed items retrieved');

    return feed.items;
  } catch (error) {
    logger.error({ error, url }, 'Failed to get RSS feed items');
    throw new Error(
      `Failed to get RSS feed items: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get latest N items from feed
 */
export async function getLatestItems(
  url: string,
  limit: number = 10
): Promise<RssFeedItem[]> {
  logger.info({ url, limit }, 'Getting latest RSS items');

  try {
    const items = await getFeedItems(url);
    const latest = items.slice(0, limit);

    logger.info({ latestCount: latest.length }, 'Latest RSS items retrieved');

    return latest;
  } catch (error) {
    logger.error({ error, url, limit }, 'Failed to get latest RSS items');
    throw new Error(
      `Failed to get latest RSS items: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Search feed items by keyword
 */
export async function searchFeedItems(
  url: string,
  keyword: string,
  searchIn: ('title' | 'content' | 'description')[] = ['title', 'content']
): Promise<RssFeedItem[]> {
  logger.info({ url, keyword, searchIn }, 'Searching RSS feed items');

  try {
    const items = await getFeedItems(url);
    const lowerKeyword = keyword.toLowerCase();

    const results = items.filter((item) => {
      for (const field of searchIn) {
        let fieldValue = '';

        if (field === 'title' && item.title) {
          fieldValue = item.title;
        } else if (field === 'content' && item.content) {
          fieldValue = item.content;
        } else if (field === 'description' && item.contentSnippet) {
          fieldValue = item.contentSnippet;
        }

        if (fieldValue.toLowerCase().includes(lowerKeyword)) {
          return true;
        }
      }

      return false;
    });

    logger.info({ resultCount: results.length }, 'RSS feed search completed');

    return results;
  } catch (error) {
    logger.error({ error, url, keyword }, 'Failed to search RSS feed');
    throw new Error(
      `Failed to search RSS feed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Filter feed items by date
 */
export async function filterItemsByDate(
  url: string,
  afterDate: Date,
  beforeDate?: Date
): Promise<RssFeedItem[]> {
  logger.info({ url, afterDate, beforeDate }, 'Filtering RSS items by date');

  try {
    const items = await getFeedItems(url);

    const filtered = items.filter((item) => {
      if (!item.pubDate) return false;

      const pubDate = new Date(item.pubDate);

      if (pubDate < afterDate) return false;
      if (beforeDate && pubDate > beforeDate) return false;

      return true;
    });

    logger.info({ filteredCount: filtered.length }, 'RSS items filtered by date');

    return filtered;
  } catch (error) {
    logger.error({ error, url }, 'Failed to filter RSS items by date');
    throw new Error(
      `Failed to filter RSS items by date: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get feed metadata
 */
export async function getFeedMetadata(url: string): Promise<{
  title?: string;
  description?: string;
  link?: string;
  language?: string;
  lastBuildDate?: string;
  image?: { url: string; title?: string; link?: string };
}> {
  logger.info({ url }, 'Getting RSS feed metadata');

  try {
    const feed = await parseFeed(url);

    const metadata = {
      title: feed.title,
      description: feed.description,
      link: feed.link,
      language: feed.language,
      lastBuildDate: (feed as { lastBuildDate?: string }).lastBuildDate,
      image: feed.image,
    };

    logger.info({ metadata }, 'RSS feed metadata retrieved');

    return metadata;
  } catch (error) {
    logger.error({ error, url }, 'Failed to get RSS feed metadata');
    throw new Error(
      `Failed to get RSS feed metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract unique categories from feed
 */
export async function getFeedCategories(url: string): Promise<string[]> {
  logger.info({ url }, 'Extracting RSS feed categories');

  try {
    const items = await getFeedItems(url);
    const categoriesSet = new Set<string>();

    items.forEach((item) => {
      if (item.categories) {
        item.categories.forEach((category) => categoriesSet.add(category));
      }
    });

    const categories = Array.from(categoriesSet);

    logger.info({ categoryCount: categories.length }, 'RSS feed categories extracted');

    return categories;
  } catch (error) {
    logger.error({ error, url }, 'Failed to extract RSS feed categories');
    throw new Error(
      `Failed to extract RSS feed categories: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get items by category
 */
export async function getItemsByCategory(
  url: string,
  category: string
): Promise<RssFeedItem[]> {
  logger.info({ url, category }, 'Getting RSS items by category');

  try {
    const items = await getFeedItems(url);

    const filtered = items.filter((item) =>
      item.categories?.some((cat) => cat.toLowerCase() === category.toLowerCase())
    );

    logger.info({ filteredCount: filtered.length }, 'RSS items filtered by category');

    return filtered;
  } catch (error) {
    logger.error({ error, url, category }, 'Failed to get RSS items by category');
    throw new Error(
      `Failed to get RSS items by category: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get items by author
 */
export async function getItemsByAuthor(
  url: string,
  author: string
): Promise<RssFeedItem[]> {
  logger.info({ url, author }, 'Getting RSS items by author');

  try {
    const items = await getFeedItems(url);

    const filtered = items.filter((item) =>
      item.author?.toLowerCase().includes(author.toLowerCase())
    );

    logger.info({ filteredCount: filtered.length }, 'RSS items filtered by author');

    return filtered;
  } catch (error) {
    logger.error({ error, url, author }, 'Failed to get RSS items by author');
    throw new Error(
      `Failed to get RSS items by author: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

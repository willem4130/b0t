/**
 * HackerNews API Module
 *
 * Access HackerNews stories, comments, and user data
 * Uses the official Firebase HackerNews API
 *
 * Perfect for:
 * - Fetching trending tech stories
 * - Monitoring HackerNews discussions
 * - Aggregating tech news
 * - Building news digests
 */

import { httpGet } from '../utilities/http';
import { logger } from '@/lib/logger';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

export interface HNItem {
  id: number;
  type: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  by: string;
  time: number;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number; // Number of comments
  kids?: number[]; // Comment IDs
  parent?: number;
  parts?: number[]; // Poll options
  deleted?: boolean;
  dead?: boolean;
}

export interface HNStory {
  id: number;
  title: string;
  url: string;
  score: number;
  by: string;
  time: number;
  descendants: number; // Number of comments
}

/**
 * Get top stories from HackerNews
 */
export async function getTopStories(options: {
  limit?: number;
  filterByDate?: boolean;
}): Promise<HNStory[]> {
  const { limit = 20, filterByDate = false } = options;

  logger.info({ limit, filterByDate }, 'Fetching HackerNews top stories');

  try {
    // Get top story IDs
    const response = await httpGet<number[]>(`${HN_API_BASE}/topstories.json`);
    const storyIds = response.data.slice(0, Math.min(limit, 500)); // API returns up to 500

    // Fetch details for all stories in parallel (10x faster!)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime() / 1000;

    const storyPromises = storyIds.map(async (id) => {
      try {
        const itemResponse = await httpGet<HNItem>(`${HN_API_BASE}/item/${id}.json`);
        const item = itemResponse.data;

        if (!item || item.deleted || item.dead) return null;

        // Filter by date if requested
        if (filterByDate && item.time < todayTimestamp) return null;

        return {
          id: item.id,
          title: item.title || 'No title',
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          by: item.by,
          time: item.time,
          descendants: item.descendants || 0,
        };
      } catch (error) {
        logger.warn({ id, error }, 'Failed to fetch story details');
        return null;
      }
    });

    const fetchedStories = await Promise.all(storyPromises);
    const stories = fetchedStories
      .filter((story): story is HNStory => story !== null)
      .slice(0, limit);

    logger.info({ count: stories.length }, 'Fetched HackerNews top stories');
    return stories;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch HackerNews top stories');
    throw new Error(`Failed to fetch HackerNews top stories: ${errorMessage}`);
  }
}

/**
 * Get new stories from HackerNews
 */
export async function getNewStories(options: {
  limit?: number;
}): Promise<HNStory[]> {
  const { limit = 20 } = options;

  logger.info({ limit }, 'Fetching HackerNews new stories');

  try {
    const response = await httpGet<number[]>(`${HN_API_BASE}/newstories.json`);
    const storyIds = response.data.slice(0, Math.min(limit, 500));

    // Fetch all stories in parallel
    const storyPromises = storyIds.map(async (id) => {
      try {
        const itemResponse = await httpGet<HNItem>(`${HN_API_BASE}/item/${id}.json`);
        const item = itemResponse.data;

        if (!item || item.deleted || item.dead) return null;

        return {
          id: item.id,
          title: item.title || 'No title',
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          by: item.by,
          time: item.time,
          descendants: item.descendants || 0,
        };
      } catch (error) {
        logger.warn({ id, error }, 'Failed to fetch story details');
        return null;
      }
    });

    const fetchedStories = await Promise.all(storyPromises);
    const stories = fetchedStories
      .filter((story): story is HNStory => story !== null)
      .slice(0, limit);

    logger.info({ count: stories.length }, 'Fetched HackerNews new stories');
    return stories;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch HackerNews new stories');
    throw new Error(`Failed to fetch HackerNews new stories: ${errorMessage}`);
  }
}

/**
 * Get best stories from HackerNews
 */
export async function getBestStories(options: {
  limit?: number;
}): Promise<HNStory[]> {
  const { limit = 20 } = options;

  logger.info({ limit }, 'Fetching HackerNews best stories');

  try {
    const response = await httpGet<number[]>(`${HN_API_BASE}/beststories.json`);
    const storyIds = response.data.slice(0, Math.min(limit, 500));

    // Fetch all stories in parallel
    const storyPromises = storyIds.map(async (id) => {
      try {
        const itemResponse = await httpGet<HNItem>(`${HN_API_BASE}/item/${id}.json`);
        const item = itemResponse.data;

        if (!item || item.deleted || item.dead) return null;

        return {
          id: item.id,
          title: item.title || 'No title',
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          by: item.by,
          time: item.time,
          descendants: item.descendants || 0,
        };
      } catch (error) {
        logger.warn({ id, error }, 'Failed to fetch story details');
        return null;
      }
    });

    const fetchedStories = await Promise.all(storyPromises);
    const stories = fetchedStories
      .filter((story): story is HNStory => story !== null)
      .slice(0, limit);

    logger.info({ count: stories.length }, 'Fetched HackerNews best stories');
    return stories;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch HackerNews best stories');
    throw new Error(`Failed to fetch HackerNews best stories: ${errorMessage}`);
  }
}

/**
 * Get Ask HN stories
 */
export async function getAskStories(options: {
  limit?: number;
}): Promise<HNStory[]> {
  const { limit = 20 } = options;

  logger.info({ limit }, 'Fetching HackerNews Ask stories');

  try {
    const response = await httpGet<number[]>(`${HN_API_BASE}/askstories.json`);
    const storyIds = response.data.slice(0, Math.min(limit, 500));

    // Fetch all stories in parallel
    const storyPromises = storyIds.map(async (id) => {
      try {
        const itemResponse = await httpGet<HNItem>(`${HN_API_BASE}/item/${id}.json`);
        const item = itemResponse.data;

        if (!item || item.deleted || item.dead) return null;

        return {
          id: item.id,
          title: item.title || 'No title',
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          by: item.by,
          time: item.time,
          descendants: item.descendants || 0,
        };
      } catch (error) {
        logger.warn({ id, error }, 'Failed to fetch story details');
        return null;
      }
    });

    const fetchedStories = await Promise.all(storyPromises);
    const stories = fetchedStories
      .filter((story): story is HNStory => story !== null)
      .slice(0, limit);

    logger.info({ count: stories.length }, 'Fetched HackerNews Ask stories');
    return stories;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch HackerNews Ask stories');
    throw new Error(`Failed to fetch HackerNews Ask stories: ${errorMessage}`);
  }
}

/**
 * Get Show HN stories
 */
export async function getShowStories(options: {
  limit?: number;
}): Promise<HNStory[]> {
  const { limit = 20 } = options;

  logger.info({ limit }, 'Fetching HackerNews Show stories');

  try {
    const response = await httpGet<number[]>(`${HN_API_BASE}/showstories.json`);
    const storyIds = response.data.slice(0, Math.min(limit, 500));

    // Fetch all stories in parallel
    const storyPromises = storyIds.map(async (id) => {
      try {
        const itemResponse = await httpGet<HNItem>(`${HN_API_BASE}/item/${id}.json`);
        const item = itemResponse.data;

        if (!item || item.deleted || item.dead) return null;

        return {
          id: item.id,
          title: item.title || 'No title',
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          by: item.by,
          time: item.time,
          descendants: item.descendants || 0,
        };
      } catch (error) {
        logger.warn({ id, error }, 'Failed to fetch story details');
        return null;
      }
    });

    const fetchedStories = await Promise.all(storyPromises);
    const stories = fetchedStories
      .filter((story): story is HNStory => story !== null)
      .slice(0, limit);

    logger.info({ count: stories.length }, 'Fetched HackerNews Show stories');
    return stories;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch HackerNews Show stories');
    throw new Error(`Failed to fetch HackerNews Show stories: ${errorMessage}`);
  }
}

/**
 * Get job postings from HackerNews
 */
export async function getJobStories(options: {
  limit?: number;
}): Promise<HNStory[]> {
  const { limit = 20 } = options;

  logger.info({ limit }, 'Fetching HackerNews job stories');

  try {
    const response = await httpGet<number[]>(`${HN_API_BASE}/jobstories.json`);
    const storyIds = response.data.slice(0, Math.min(limit, 500));

    // Fetch all stories in parallel
    const storyPromises = storyIds.map(async (id) => {
      try {
        const itemResponse = await httpGet<HNItem>(`${HN_API_BASE}/item/${id}.json`);
        const item = itemResponse.data;

        if (!item || item.deleted || item.dead) return null;

        return {
          id: item.id,
          title: item.title || 'No title',
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          by: item.by,
          time: item.time,
          descendants: item.descendants || 0,
        };
      } catch (error) {
        logger.warn({ id, error }, 'Failed to fetch story details');
        return null;
      }
    });

    const fetchedStories = await Promise.all(storyPromises);
    const stories = fetchedStories
      .filter((story): story is HNStory => story !== null)
      .slice(0, limit);

    logger.info({ count: stories.length }, 'Fetched HackerNews job stories');
    return stories;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch HackerNews job stories');
    throw new Error(`Failed to fetch HackerNews job stories: ${errorMessage}`);
  }
}

/**
 * Get story details by ID
 */
export async function getStoryDetails(options: {
  id: number;
}): Promise<HNItem> {
  const { id } = options;

  logger.info({ id }, 'Fetching HackerNews story details');

  try {
    const response = await httpGet<HNItem>(`${HN_API_BASE}/item/${id}.json`);

    if (!response.data) {
      throw new Error('Story not found');
    }

    logger.info({ id }, 'Fetched HackerNews story details');
    return response.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage, id }, 'Failed to fetch HackerNews story details');
    throw new Error(`Failed to fetch HackerNews story details: ${errorMessage}`);
  }
}

/**
 * Get user details by username
 */
export async function getUserDetails(options: {
  username: string;
}): Promise<Record<string, unknown>> {
  const { username } = options;

  logger.info({ username }, 'Fetching HackerNews user details');

  try {
    const response = await httpGet<Record<string, unknown>>(`${HN_API_BASE}/user/${username}.json`);

    if (!response.data) {
      throw new Error('User not found');
    }

    logger.info({ username }, 'Fetched HackerNews user details');
    return response.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage, username }, 'Failed to fetch HackerNews user details');
    throw new Error(`Failed to fetch HackerNews user details: ${errorMessage}`);
  }
}

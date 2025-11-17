import { logger } from '@/lib/logger';

/**
 * Scoring and Ranking Module
 *
 * Generic scoring functions for ranking items by custom weighted metrics.
 * Works with any objects containing numeric fields.
 *
 * Perfect for:
 * - Ranking tweets by engagement (likes + retweets + replies)
 * - Ranking videos by popularity (views + likes + comments)
 * - Ranking posts by score (upvotes + comments + age)
 * - Prioritizing items by custom business logic
 */

export interface ScoreField {
  field: string;
  weight: number;
}

export interface TieBreaker {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Rank array of objects by weighted score calculation
 *
 * @param items - Array of objects to rank
 * @param scoreFields - Array of {field, weight} to calculate score
 * @param tieBreaker - Optional tie-breaker for items with similar scores
 * @returns Ranked array (highest score first)
 *
 * @example
 * const rankedTweets = await rankByWeightedScore({
 *   items: tweets,
 *   scoreFields: [
 *     { field: "likes", weight: 1 },
 *     { field: "retweets", weight: 2 },
 *     { field: "replies", weight: 1.5 },
 *     { field: "views", weight: 0.001 }
 *   ],
 *   tieBreaker: { field: "created_at", order: "desc" }
 * });
 */
export async function rankByWeightedScore<T extends Record<string, unknown>>(params: {
  items: T[];
  scoreFields: ScoreField[];
  tieBreaker?: TieBreaker;
  similarityThreshold?: number; // Default: 0.1 (10%)
}): Promise<T[]> {
  const { items, scoreFields, tieBreaker, similarityThreshold = 0.1 } = params;

  if (!items || items.length === 0) {
    logger.info('No items to rank');
    return [];
  }

  logger.info(
    {
      itemCount: items.length,
      scoreFields: scoreFields.map(f => `${f.field}×${f.weight}`),
      hasTieBreaker: !!tieBreaker,
    },
    'Ranking items by weighted score'
  );

  try {
    // Calculate scores for each item
    const itemsWithScores = items.map(item => {
      let score = 0;

      for (const { field, weight } of scoreFields) {
        const value = Number(item[field]) || 0;
        score += value * weight;
      }

      return {
        item,
        score,
        tieBreakerValue: tieBreaker ? item[tieBreaker.field] : null,
      };
    });

    // Sort by score and optional tie-breaker
    itemsWithScores.sort((a, b) => {
      // Check if scores are similar (within threshold)
      const scoreDiff = Math.abs(a.score - b.score);
      const avgScore = (a.score + b.score) / 2;
      const areScoresSimilar = avgScore > 0 && scoreDiff / avgScore < similarityThreshold;

      if (areScoresSimilar && tieBreaker) {
        // Use tie-breaker if scores are similar
        const aVal = a.tieBreakerValue;
        const bVal = b.tieBreakerValue;

        // Handle different data types
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          // For timestamps/dates, convert to comparable format
          const aTime = new Date(aVal).getTime();
          const bTime = new Date(bVal).getTime();

          if (!isNaN(aTime) && !isNaN(bTime)) {
            return tieBreaker.order === 'desc' ? bTime - aTime : aTime - bTime;
          }

          // Fallback to string comparison
          return tieBreaker.order === 'desc'
            ? bVal.localeCompare(aVal)
            : aVal.localeCompare(bVal);
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return tieBreaker.order === 'desc' ? bVal - aVal : aVal - bVal;
        }
      }

      // Sort by score (highest first)
      return b.score - a.score;
    });

    const rankedItems = itemsWithScores.map(x => x.item);

    logger.info(
      {
        itemCount: rankedItems.length,
        topScore: itemsWithScores[0]?.score || 0,
        bottomScore: itemsWithScores[itemsWithScores.length - 1]?.score || 0,
      },
      'Ranking complete'
    );

    return rankedItems;
  } catch (error) {
    logger.error({ error, scoreFields }, 'Ranking failed');
    throw new Error(
      `Failed to rank items: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Calculate weighted score for a single item
 *
 * @param item - Object to score
 * @param scoreFields - Array of {field, weight} to calculate score
 * @returns Numeric score
 *
 * @example
 * const score = await calculateScore({
 *   item: tweet,
 *   scoreFields: [
 *     { field: "likes", weight: 1 },
 *     { field: "retweets", weight: 2 }
 *   ]
 * });
 */
export async function calculateScore<T extends Record<string, unknown>>(params: {
  item: T;
  scoreFields: ScoreField[];
}): Promise<number> {
  const { item, scoreFields } = params;

  let score = 0;

  for (const { field, weight } of scoreFields) {
    const value = Number(item[field]) || 0;
    score += value * weight;
  }

  logger.info({ score, scoreFields }, 'Score calculated');

  return score;
}

/**
 * Select top N items from array
 *
 * @param items - Array to select from
 * @param count - Number of items to select (default: 1)
 * @returns Single item if count=1, array if count>1
 *
 * @example
 * const topTweet = await selectTop({ items: rankedTweets, count: 1 });
 * const top5Tweets = await selectTop({ items: rankedTweets, count: 5 });
 */
export async function selectTop<T>(params: {
  items: T[];
  count?: number;
}): Promise<T | T[] | null> {
  const { items, count = 1 } = params;

  if (!items || items.length === 0) {
    logger.info('No items to select from');
    return null;
  }

  if (count === 1) {
    logger.info('Selected top item');
    return items[0];
  }

  const selected = items.slice(0, count);
  logger.info({ count: selected.length }, 'Selected top items');
  return selected;
}

/**
 * Select bottom N items from array
 *
 * @param items - Array to select from
 * @param count - Number of items to select (default: 1)
 * @returns Single item if count=1, array if count>1
 *
 * @example
 * const lowestRanked = await selectBottom({ items: rankedTweets, count: 1 });
 */
export async function selectBottom<T>(params: {
  items: T[];
  count?: number;
}): Promise<T | T[] | null> {
  const { items, count = 1 } = params;

  if (!items || items.length === 0) {
    logger.info('No items to select from');
    return null;
  }

  if (count === 1) {
    logger.info('Selected bottom item');
    return items[items.length - 1];
  }

  const selected = items.slice(-count);
  logger.info({ count: selected.length }, 'Selected bottom items');
  return selected;
}

/**
 * Select random item(s) from array
 *
 * @param items - Array to select from
 * @param count - Number of items to select (default: 1)
 * @returns Single item if count=1, array if count>1
 *
 * @example
 * const randomTweet = await selectRandom({ items: tweets, count: 1 });
 * const random3Tweets = await selectRandom({ items: tweets, count: 3 });
 */
export async function selectRandom<T>(params: {
  items: T[];
  count?: number;
}): Promise<T | T[] | null> {
  const { items, count = 1 } = params;

  if (!items || items.length === 0) {
    logger.info('No items to select from');
    return null;
  }

  // Fisher-Yates shuffle
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (count === 1) {
    logger.info('Selected random item');
    return shuffled[0];
  }

  const selected = shuffled.slice(0, Math.min(count, shuffled.length));
  logger.info({ count: selected.length }, 'Selected random items');
  return selected;
}

/**
 * Rank items by single field (convenience function)
 *
 * @param items - Array to rank
 * @param field - Field to rank by
 * @param order - Sort order (default: 'desc')
 * @returns Ranked array
 *
 * @example
 * const tweetsByLikes = await rankByField({ items: tweets, field: "likes", order: "desc" });
 */
export async function rankByField<T extends Record<string, unknown>>(params: {
  items: T[];
  field: string;
  order?: 'asc' | 'desc';
}): Promise<T[]> {
  const { items, field, order = 'desc' } = params;

  if (!items || items.length === 0) {
    logger.info('No items to rank');
    return [];
  }

  const sorted = [...items].sort((a, b) => {
    const aVal = Number(a[field]) || 0;
    const bVal = Number(b[field]) || 0;

    return order === 'desc' ? bVal - aVal : aVal - bVal;
  });

  logger.info({ itemCount: sorted.length, field, order }, 'Ranked by field');

  return sorted;
}

/**
 * Filter items above a minimum score threshold
 *
 * @param items - Array to filter
 * @param scoreFields - Array of {field, weight} to calculate score
 * @param minScore - Minimum score threshold
 * @returns Filtered array
 *
 * @example
 * const popularTweets = await filterByMinScore({
 *   items: tweets,
 *   scoreFields: [{ field: "likes", weight: 1 }],
 *   minScore: 100
 * });
 */
export async function filterByMinScore<T extends Record<string, unknown>>(params: {
  items: T[];
  scoreFields: ScoreField[];
  minScore: number;
}): Promise<T[]> {
  const { items, scoreFields, minScore } = params;

  if (!items || items.length === 0) {
    return [];
  }

  const itemsWithScores = await Promise.all(
    items.map(async item => ({
      item,
      score: await calculateScore({ item, scoreFields }),
    }))
  );

  const filtered = itemsWithScores
    .filter(x => x.score >= minScore)
    .map(x => x.item);

  logger.info(
    {
      totalItems: items.length,
      filteredItems: filtered.length,
      minScore,
    },
    'Filtered by minimum score'
  );

  return filtered;
}

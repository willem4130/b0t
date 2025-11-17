/**
 * RapidAPI Twitter Search (Flattened Export for Module Registry)
 *
 * This provides a direct export wrapper so the module registry generator can detect it.
 */

import { searchTwitter as searchTwitterImpl, type Tweet, type SearchParams, type SearchResponse } from './rapidapi/twitter/search';

/**
 * Search Twitter using RapidAPI
 *
 * @example
 * const results = await searchTwitter({ query: "AI tools", apiKey: "YOUR_KEY", count: 20 });
 */
export async function searchTwitter(params: SearchParams): Promise<SearchResponse> {
  return searchTwitterImpl(params);
}

export type { Tweet, SearchParams, SearchResponse };

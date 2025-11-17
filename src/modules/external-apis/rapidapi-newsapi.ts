/**
 * RapidAPI News API (Flattened Export for Module Registry)
 *
 * This provides direct export wrappers so the module registry generator can detect them.
 * All functions use the same RapidAPI key: {{credential.rapidapi_api_key}}
 */

import {
  getTrendingNews as getTrendingNewsImpl,
  getArticleContent as getArticleContentImpl,
  getSupportedTopics as getSupportedTopicsImpl,
  getSupportedLanguages as getSupportedLanguagesImpl,
  getSupportedCountries as getSupportedCountriesImpl,
  getNewsSummaryForAI as getNewsSummaryForAIImpl,
  type NewsArticle,
  type Topic,
  type Language,
  type Country,
} from './rapidapi/newsapi';

/**
 * Get trending news articles
 *
 * @example
 * const articles = await getTrendingNews({ apiKey: "YOUR_KEY", topic: "technology", limit: 10 });
 */
export async function getTrendingNews(params: {
  apiKey: string;
  topic?: string;
  language?: string;
  country?: string;
  limit?: number;
  excludeUrls?: string[];
}): Promise<NewsArticle[]> {
  return getTrendingNewsImpl(params);
}

/**
 * Get full article content
 *
 * @example
 * const article = await getArticleContent({ apiKey: "YOUR_KEY", articleUrl: "https://..." });
 */
export async function getArticleContent(params: {
  apiKey: string;
  articleUrl: string;
}): Promise<{
  title: string;
  content: string;
  url: string;
  authors: string[];
  date: string;
}> {
  return getArticleContentImpl(params);
}

/**
 * Get supported news topics with subtopics
 *
 * @example
 * const topics = await getSupportedTopics({ apiKey: "YOUR_KEY" });
 */
export async function getSupportedTopics(params: { apiKey: string }): Promise<Topic[]> {
  return getSupportedTopicsImpl(params);
}

/**
 * Get supported languages for news
 *
 * @example
 * const languages = await getSupportedLanguages({ apiKey: "YOUR_KEY" });
 */
export async function getSupportedLanguages(params: { apiKey: string }): Promise<Language[]> {
  return getSupportedLanguagesImpl(params);
}

/**
 * Get supported countries with their languages
 *
 * @example
 * const countries = await getSupportedCountries({ apiKey: "YOUR_KEY" });
 */
export async function getSupportedCountries(params: { apiKey: string }): Promise<Country[]> {
  return getSupportedCountriesImpl(params);
}

/**
 * Get AI-formatted summary of trending news
 *
 * @example
 * const { summary, selectedArticle } = await getNewsSummaryForAI({ apiKey: "YOUR_KEY", topic: "ai" });
 */
export async function getNewsSummaryForAI(params: {
  apiKey: string;
  topic?: string;
  language?: string;
  country?: string;
  limit?: number;
  excludeUrls?: string[];
}): Promise<{ summary: string; selectedArticle: NewsArticle | null }> {
  return getNewsSummaryForAIImpl(params);
}

export type { NewsArticle, Topic, Language, Country };

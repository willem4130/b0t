import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Cohere AI Module
 *
 * Enterprise-grade language AI for generation, embeddings, and reranking.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (100 requests/min)
 * - Structured logging
 * - 60s timeout for generation operations
 *
 * Use cases:
 * - Text generation and completion
 * - Document embeddings for search
 * - Search result reranking
 * - Semantic similarity
 */

if (!process.env.COHERE_API_KEY) {
  logger.warn('COHERE_API_KEY is not set. Cohere features will not work.');
}

const COHERE_API_URL = 'https://api.cohere.ai/v1';

// Rate limiter: 100 requests per minute
const cohereRateLimiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 600,
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000,
  id: 'cohere-api',
});

interface CohereGenerateResponse {
  text: string;
  generations?: Array<{
    text: string;
    likelihood?: number;
  }>;
  meta?: Record<string, unknown>;
}

interface CohereEmbedResponse {
  embeddings: number[][];
  meta?: Record<string, unknown>;
}

interface CohereRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
    document?: {
      text: string;
    };
  }>;
  meta?: Record<string, unknown>;
}

/**
 * Helper function to make API requests
 */
async function cohereApiRequest(
  endpoint: string,
  method: string = 'POST',
  body?: unknown
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${COHERE_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Generate text using Cohere's language models
 */
async function generateInternal(
  prompt: string,
  model: string = 'command',
  maxTokens: number = 1024,
  temperature: number = 0.7,
  stopSequences?: string[]
): Promise<CohereGenerateResponse> {
  logger.info(
    { promptLength: prompt.length, model, maxTokens, temperature },
    'Generating text with Cohere'
  );

  const body: Record<string, unknown> = {
    prompt,
    model,
    max_tokens: maxTokens,
    temperature,
  };

  if (stopSequences) {
    body.stop_sequences = stopSequences;
  }

  const result = await cohereApiRequest('/generate', 'POST', body);

  logger.info({ textLength: (result as CohereGenerateResponse).text?.length }, 'Text generated');
  return result as CohereGenerateResponse;
}

const generateWithBreaker = createCircuitBreaker(generateInternal, {
  timeout: 60000,
  name: 'cohere:generate',
});

export const generate = withRateLimit(
  (
    prompt: string,
    model?: string,
    maxTokens?: number,
    temperature?: number,
    stopSequences?: string[]
  ) => generateWithBreaker.fire(prompt, model, maxTokens, temperature, stopSequences),
  cohereRateLimiter
);

/**
 * Generate embeddings for text documents
 */
async function embedInternal(
  texts: string[],
  model: string = 'embed-english-v3.0',
  inputType: 'search_document' | 'search_query' | 'classification' | 'clustering' = 'search_document'
): Promise<CohereEmbedResponse> {
  logger.info({ textCount: texts.length, model, inputType }, 'Generating embeddings');

  const body = {
    texts,
    model,
    input_type: inputType,
  };

  const result = await cohereApiRequest('/embed', 'POST', body);

  logger.info(
    { embeddingCount: (result as CohereEmbedResponse).embeddings?.length },
    'Embeddings generated'
  );
  return result as CohereEmbedResponse;
}

const embedWithBreaker = createCircuitBreaker(embedInternal, {
  timeout: 60000,
  name: 'cohere:embed',
});

export const embed = withRateLimit(
  (
    texts: string[],
    model?: string,
    inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering'
  ) => embedWithBreaker.fire(texts, model, inputType),
  cohereRateLimiter
);

/**
 * Rerank search results by relevance to a query
 */
async function rerankInternal(
  query: string,
  documents: (string | { text: string })[],
  topN?: number,
  model: string = 'rerank-english-v3.0'
): Promise<CohereRerankResponse> {
  logger.info({ query, documentCount: documents.length, topN, model }, 'Reranking with Cohere');

  const body: Record<string, unknown> = {
    query,
    documents: documents.map((doc) => (typeof doc === 'string' ? doc : doc.text)),
    model,
  };

  if (topN) {
    body.top_n = topN;
  }

  const result = await cohereApiRequest('/rerank', 'POST', body);

  logger.info({ resultCount: (result as CohereRerankResponse).results?.length }, 'Reranking completed');
  return result as CohereRerankResponse;
}

const rerankWithBreaker = createCircuitBreaker(rerankInternal, {
  timeout: 60000,
  name: 'cohere:rerank',
});

export const rerank = withRateLimit(
  (query: string, documents: (string | { text: string })[], topN?: number, model?: string) =>
    rerankWithBreaker.fire(query, documents, topN, model),
  cohereRateLimiter
);

import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Replicate Video Generation Module
 *
 * Run AI video models through Replicate's API.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (50 requests/min)
 * - Structured logging
 * - 180s timeout for video generation
 *
 * Use cases:
 * - Text-to-video generation
 * - Video style transfer
 * - Video upscaling
 * - Custom video models
 */

if (!process.env.REPLICATE_API_KEY) {
  logger.warn('REPLICATE_API_KEY is not set. Replicate video features will not work.');
}

const REPLICATE_API_URL = 'https://api.replicate.com/v1';

// Rate limiter: 50 requests per minute
const replicateRateLimiter = createRateLimiter({
  maxConcurrent: 3,
  minTime: 1200, // 1.2s between requests
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000,
  id: 'replicate-video-api',
});

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string;
  logs?: string;
  metrics?: {
    predict_time?: number;
  };
}

interface ReplicateModel {
  owner: string;
  name: string;
  description?: string;
  visibility: string;
  github_url?: string;
  paper_url?: string;
  license_url?: string;
  run_count?: number;
  cover_image_url?: string;
  default_example?: Record<string, unknown>;
  latest_version?: {
    id: string;
    created_at: string;
  };
}

/**
 * Helper function to make API requests
 */
async function replicateApiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Authorization': `Token ${process.env.REPLICATE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${REPLICATE_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Generate video using a Replicate model
 */
async function generateVideoInternal(
  modelVersion: string,
  prompt: string,
  duration?: number,
  additionalInputs?: Record<string, unknown>
): Promise<ReplicatePrediction> {
  logger.info(
    { modelVersion, promptLength: prompt.length, duration },
    'Generating video with Replicate'
  );

  const input: Record<string, unknown> = {
    prompt,
    ...(duration && { duration }),
    ...additionalInputs,
  };

  const result = await replicateApiRequest('/predictions', 'POST', {
    version: modelVersion,
    input,
  });

  logger.info({ id: (result as ReplicatePrediction).id }, 'Video generation started');
  return result as ReplicatePrediction;
}

const generateVideoWithBreaker = createCircuitBreaker(generateVideoInternal, {
  timeout: 180000,
  name: 'replicate:generateVideo',
});

export const generateVideo = withRateLimit(
  (
    modelVersion: string,
    prompt: string,
    duration?: number,
    additionalInputs?: Record<string, unknown>
  ) => generateVideoWithBreaker.fire(modelVersion, prompt, duration, additionalInputs),
  replicateRateLimiter
);

/**
 * Get prediction status and results
 */
async function getPredictionInternal(predictionId: string): Promise<ReplicatePrediction> {
  logger.info({ predictionId }, 'Getting Replicate prediction status');

  const result = await replicateApiRequest(`/predictions/${predictionId}`);

  logger.info({ status: (result as ReplicatePrediction).status }, 'Prediction status retrieved');
  return result as ReplicatePrediction;
}

const getPredictionWithBreaker = createCircuitBreaker(getPredictionInternal, {
  timeout: 30000,
  name: 'replicate:getPrediction',
});

export const getPrediction = withRateLimit(
  (predictionId: string) => getPredictionWithBreaker.fire(predictionId),
  replicateRateLimiter
);

/**
 * Search for video models on Replicate
 */
async function listModelsInternal(query?: string): Promise<{ results: ReplicateModel[] }> {
  logger.info({ query }, 'Searching Replicate models');

  const endpoint = query ? `/models?query=${encodeURIComponent(query)}` : '/models';
  const result = await replicateApiRequest(endpoint);

  const models = (result as { results: ReplicateModel[] }).results || [];

  logger.info({ count: models.length }, 'Models listed');
  return { results: models };
}

const listModelsWithBreaker = createCircuitBreaker(listModelsInternal, {
  timeout: 30000,
  name: 'replicate:listModels',
});

export const listModels = withRateLimit(
  (query?: string) => listModelsWithBreaker.fire(query),
  replicateRateLimiter
);

/**
 * Get model information
 */
async function getModelInternal(owner: string, name: string): Promise<{ model: ReplicateModel }> {
  logger.info({ owner, name }, 'Getting Replicate model details');

  const result = await replicateApiRequest(`/models/${owner}/${name}`);

  logger.info({ owner, name }, 'Model details retrieved');
  return { model: result as ReplicateModel };
}

const getModelWithBreaker = createCircuitBreaker(getModelInternal, {
  timeout: 30000,
  name: 'replicate:getModel',
});

export const getModel = withRateLimit(
  (owner: string, name: string) => getModelWithBreaker.fire(owner, name),
  replicateRateLimiter
);

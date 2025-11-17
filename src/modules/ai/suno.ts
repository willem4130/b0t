import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Suno AI Music Generation Module
 *
 * AI-powered music creation from text prompts.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (30 requests/min)
 * - Structured logging
 * - 120s timeout for music generation
 *
 * Use cases:
 * - Song generation from lyrics
 * - Background music creation
 * - Custom music for videos
 * - Jingles and soundtracks
 */

if (!process.env.SUNO_API_KEY) {
  logger.warn('⚠️  SUNO_API_KEY is not set. Suno features will not work.');
}

const SUNO_API_URL = 'https://api.suno.ai/v1';

// Rate limiter: 30 requests per minute (more conservative for music generation)
const sunoRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 2000, // 2s between requests
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 60 * 1000,
  id: 'suno-api',
});

interface SunoGeneration {
  id: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  audioUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
  title?: string;
  duration?: number;
  createdAt?: string;
}

/**
 * Helper function to make API requests
 */
async function sunoApiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${SUNO_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Suno API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Generate music from text prompt
 *
 * @param prompt - Description of the music to generate
 * @param lyrics - Optional lyrics for the song
 * @param style - Optional music style/genre
 * @param duration - Desired duration in seconds (default: 30)
 * @param instrumental - Generate instrumental only (default: false)
 * @returns Generation task with ID
 */
async function generateMusicInternal(
  prompt: string,
  lyrics?: string,
  style?: string,
  duration: number = 30,
  instrumental: boolean = false
): Promise<SunoGeneration> {
  logger.info(
    { promptLength: prompt.length, hasLyrics: !!lyrics, style, duration, instrumental },
    'Generating music with Suno'
  );

  const body = {
    prompt,
    ...(lyrics && { lyrics }),
    ...(style && { style }),
    duration,
    instrumental,
  };

  const result = await sunoApiRequest('/generate', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Music generation started');
  return result as SunoGeneration;
}

const generateMusicWithBreaker = createCircuitBreaker(generateMusicInternal, {
  timeout: 120000,
  name: 'suno:generateMusic',
});

/**
 * Generate music from text prompt (protected)
 */
export const generateMusic = withRateLimit(
  (prompt: string, lyrics?: string, style?: string, duration?: number, instrumental?: boolean) =>
    generateMusicWithBreaker.fire(prompt, lyrics, style, duration, instrumental),
  sunoRateLimiter
);

/**
 * Generate song with custom lyrics
 *
 * @param lyrics - Song lyrics
 * @param title - Song title
 * @param genre - Music genre
 * @param mood - Mood/vibe of the song
 * @returns Generation task with ID
 */
async function generateSongInternal(
  lyrics: string,
  title: string,
  genre?: string,
  mood?: string
): Promise<SunoGeneration> {
  logger.info({ lyricsLength: lyrics.length, title, genre, mood }, 'Generating song with Suno');

  const prompt = `Create a ${genre || 'song'} with a ${mood || 'neutral'} mood titled "${title}"`;

  const body = {
    prompt,
    lyrics,
    title,
    ...(genre && { style: genre }),
  };

  const result = await sunoApiRequest('/generate', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Song generation started');
  return result as SunoGeneration;
}

const generateSongWithBreaker = createCircuitBreaker(generateSongInternal, {
  timeout: 120000,
  name: 'suno:generateSong',
});

/**
 * Generate song with custom lyrics (protected)
 */
export const generateSong = withRateLimit(
  (lyrics: string, title: string, genre?: string, mood?: string) =>
    generateSongWithBreaker.fire(lyrics, title, genre, mood),
  sunoRateLimiter
);

/**
 * Get generation status
 *
 * @param generationId - ID of the generation task
 * @returns Generation status and URLs if complete
 */
async function getGenerationInternal(generationId: string): Promise<SunoGeneration> {
  logger.info({ generationId }, 'Getting Suno generation status');

  const result = await sunoApiRequest(`/generate/${generationId}`);

  logger.info({ status: (result as SunoGeneration).status }, 'Generation status retrieved');
  return result as SunoGeneration;
}

const getGenerationWithBreaker = createCircuitBreaker(getGenerationInternal, {
  timeout: 30000,
  name: 'suno:getGeneration',
});

/**
 * Get generation status (protected)
 */
export const getGeneration = withRateLimit(
  (generationId: string) => getGenerationWithBreaker.fire(generationId),
  sunoRateLimiter
);

/**
 * List all generations
 *
 * @param limit - Number of generations to return (default: 20)
 * @param offset - Pagination offset (default: 0)
 * @returns Array of generations
 */
async function listGenerationsInternal(
  limit: number = 20,
  offset: number = 0
): Promise<{ generations: SunoGeneration[]; total: number }> {
  logger.info({ limit, offset }, 'Listing Suno generations');

  const result = await sunoApiRequest(`/generate?limit=${limit}&offset=${offset}`);

  logger.info(
    { count: ((result as { generations: unknown[] }).generations || []).length },
    'Generations listed'
  );
  return result as { generations: SunoGeneration[]; total: number };
}

const listGenerationsWithBreaker = createCircuitBreaker(listGenerationsInternal, {
  timeout: 30000,
  name: 'suno:listGenerations',
});

/**
 * List all generations (protected)
 */
export const listGenerations = withRateLimit(
  (limit?: number, offset?: number) => listGenerationsWithBreaker.fire(limit, offset),
  sunoRateLimiter
);

/**
 * Extend/continue existing music
 *
 * @param generationId - ID of the generation to extend
 * @param duration - Additional duration in seconds (default: 30)
 * @returns New generation task
 */
async function extendMusicInternal(
  generationId: string,
  duration: number = 30
): Promise<SunoGeneration> {
  logger.info({ generationId, duration }, 'Extending music with Suno');

  const body = {
    generationId,
    duration,
  };

  const result = await sunoApiRequest('/extend', 'POST', body);

  logger.info({ id: (result as { id: string }).id }, 'Music extension started');
  return result as SunoGeneration;
}

const extendMusicWithBreaker = createCircuitBreaker(extendMusicInternal, {
  timeout: 120000,
  name: 'suno:extendMusic',
});

/**
 * Extend/continue existing music (protected)
 */
export const extendMusic = withRateLimit(
  (generationId: string, duration?: number) => extendMusicWithBreaker.fire(generationId, duration),
  sunoRateLimiter
);

/**
 * Get credits/usage information
 *
 * @returns Credits remaining and usage stats
 */
async function getCreditsInternal(): Promise<{
  creditsRemaining: number;
  creditsTotal: number;
  generationsUsed: number;
}> {
  logger.info('Getting Suno credits information');

  const result = await sunoApiRequest('/credits');

  logger.info({ creditsRemaining: (result as { creditsRemaining: number }).creditsRemaining }, 'Credits retrieved');
  return result as { creditsRemaining: number; creditsTotal: number; generationsUsed: number };
}

const getCreditsWithBreaker = createCircuitBreaker(getCreditsInternal, {
  timeout: 30000,
  name: 'suno:getCredits',
});

/**
 * Get credits/usage information (protected)
 */
export const getCredits = withRateLimit(() => getCreditsWithBreaker.fire(), sunoRateLimiter);

/**
 * Delete a generation
 *
 * @param generationId - ID of the generation to delete
 * @returns Success status
 */
async function deleteGenerationInternal(generationId: string): Promise<{ success: boolean }> {
  logger.info({ generationId }, 'Deleting Suno generation');

  await sunoApiRequest(`/generate/${generationId}`, 'DELETE');

  logger.info('Generation deleted successfully');
  return { success: true };
}

const deleteGenerationWithBreaker = createCircuitBreaker(deleteGenerationInternal, {
  timeout: 30000,
  name: 'suno:deleteGeneration',
});

/**
 * Delete a generation (protected)
 */
export const deleteGeneration = withRateLimit(
  (generationId: string) => deleteGenerationWithBreaker.fire(generationId),
  sunoRateLimiter
);

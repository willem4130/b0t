/* eslint-disable */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { withRateLimit } from '@/lib/rate-limiter';
import OpenAI from 'openai';

/**
 * OpenAI Whisper Audio Transcription Module
 *
 * Features:
 * - Transcribe audio/video files to text
 * - Translate to English
 * - Auto language detection
 * - Timestamp support
 * - Circuit breaker protection
 * - Rate limiting (50 req/min)
 * - Structured logging
 *
 * API Reference: https://platform.openai.com/docs/guides/speech-to-text
 */

// Rate limiter: 50 requests per minute
const whisperRateLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 1200, // 1.2 seconds between requests
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000,
});

/**
 * Get OpenAI client
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  return new OpenAI({
    apiKey,
    timeout: 60000, // 60 second timeout for transcription
  });
}

/**
 * Transcribe audio file to text
 * @param options - Transcription options
 * @returns Transcription result
 */
async function transcribeAudioInternal(options: {
  audioFile: File | Blob; // Audio file (mp3, mp4, mpeg, mpga, m4a, wav, webm)
  language?: string; // Optional language code (e.g., 'en', 'es', 'fr')
  prompt?: string; // Optional context to improve accuracy
  temperature?: number; // 0-1, sampling temperature
  timestampGranularity?: 'word' | 'segment'; // Include timestamps
}): Promise<{
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}> {
  logger.info({ language: options.language }, 'Transcribing audio with Whisper');

  const openai = getOpenAIClient();

  const transcription = await openai.audio.transcriptions.create({
    file: options.audioFile,
    model: 'whisper-1',
    language: options.language,
    prompt: options.prompt,
    temperature: options.temperature || 0,
    response_format: options.timestampGranularity ? 'verbose_json' : 'json',
    timestamp_granularities: options.timestampGranularity ? [options.timestampGranularity] : undefined,
  });

  logger.info({ textLength: transcription.text.length }, 'Audio transcription completed');

  // Type guard for verbose response
  if ('segments' in transcription || 'words' in transcription) {
    return {
      text: transcription.text,
      language: (transcription as any).language,
      duration: (transcription as any).duration,
      segments: (transcription as any).segments,
      words: (transcription as any).words,
    };
  }

  return {
    text: transcription.text,
  };
}

const transcribeAudioWithBreaker = createCircuitBreaker(transcribeAudioInternal, {
  timeout: 120000, // 2 minutes for large files
  name: 'whisper:transcribeAudio',
});

export const transcribeAudio = withRateLimit(
  (options: Parameters<typeof transcribeAudioInternal>[0]) =>
    transcribeAudioWithBreaker.fire(options),
  whisperRateLimiter
);

/**
 * Transcribe audio from URL
 * @param options - Transcription options
 * @returns Transcription result
 */
async function transcribeAudioFromURLInternal(options: {
  audioUrl: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  timestampGranularity?: 'word' | 'segment';
}): Promise<{
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}> {
  logger.info({ audioUrl: options.audioUrl }, 'Fetching and transcribing audio from URL');

  // Fetch audio file
  const response = await fetch(options.audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
  }

  const audioBlob = await response.blob();

  // Transcribe the fetched audio
  return transcribeAudioInternal({
    audioFile: audioBlob,
    language: options.language,
    prompt: options.prompt,
    temperature: options.temperature,
    timestampGranularity: options.timestampGranularity,
  });
}

const transcribeAudioFromURLWithBreaker = createCircuitBreaker(transcribeAudioFromURLInternal, {
  timeout: 120000,
  name: 'whisper:transcribeAudioFromURL',
});

export const transcribeAudioFromURL = withRateLimit(
  (options: Parameters<typeof transcribeAudioFromURLInternal>[0]) =>
    transcribeAudioFromURLWithBreaker.fire(options),
  whisperRateLimiter
);

/**
 * Translate audio to English
 * @param options - Translation options
 * @returns Translation result
 */
async function translateAudioInternal(options: {
  audioFile: File | Blob;
  prompt?: string; // Optional context to improve accuracy
  temperature?: number;
}): Promise<{
  text: string; // Translated text in English
  language?: string; // Detected source language
}> {
  logger.info('Translating audio to English with Whisper');

  const openai = getOpenAIClient();

  const translation = await openai.audio.translations.create({
    file: options.audioFile,
    model: 'whisper-1',
    prompt: options.prompt,
    temperature: options.temperature || 0,
    response_format: 'json',
  });

  logger.info({ textLength: translation.text.length }, 'Audio translation completed');

  return {
    text: translation.text,
  };
}

const translateAudioWithBreaker = createCircuitBreaker(translateAudioInternal, {
  timeout: 120000,
  name: 'whisper:translateAudio',
});

export const translateAudio = withRateLimit(
  (options: Parameters<typeof translateAudioInternal>[0]) =>
    translateAudioWithBreaker.fire(options),
  whisperRateLimiter
);

/**
 * Translate audio from URL to English
 * @param options - Translation options
 * @returns Translation result
 */
async function translateAudioFromURLInternal(options: {
  audioUrl: string;
  prompt?: string;
  temperature?: number;
}): Promise<{
  text: string;
  language?: string;
}> {
  logger.info({ audioUrl: options.audioUrl }, 'Fetching and translating audio from URL');

  // Fetch audio file
  const response = await fetch(options.audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
  }

  const audioBlob = await response.blob();

  // Translate the fetched audio
  return translateAudioInternal({
    audioFile: audioBlob,
    prompt: options.prompt,
    temperature: options.temperature,
  });
}

const translateAudioFromURLWithBreaker = createCircuitBreaker(translateAudioFromURLInternal, {
  timeout: 120000,
  name: 'whisper:translateAudioFromURL',
});

export const translateAudioFromURL = withRateLimit(
  (options: Parameters<typeof translateAudioFromURLInternal>[0]) =>
    translateAudioFromURLWithBreaker.fire(options),
  whisperRateLimiter
);

/**
 * Detect language from audio
 * @param audioFile - Audio file to analyze
 * @returns Detected language
 */
async function detectLanguageInternal(audioFile: File | Blob): Promise<{
  language: string; // ISO 639-1 language code
  confidence?: number;
}> {
  logger.info('Detecting language from audio');

  const openai = getOpenAIClient();

  // Transcribe with verbose response to get language info
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
  });

  logger.info(
    { language: (transcription as any).language },
    'Language detected'
  );

  return {
    language: (transcription as any).language || 'unknown',
  };
}

const detectLanguageWithBreaker = createCircuitBreaker(detectLanguageInternal, {
  timeout: 120000,
  name: 'whisper:detectLanguage',
});

export const detectLanguage = withRateLimit(
  (audioFile: File | Blob) => detectLanguageWithBreaker.fire(audioFile),
  whisperRateLimiter
);

/**
 * Transcribe with speaker diarization (identify different speakers)
 * Note: Whisper doesn't natively support speaker diarization,
 * but we can provide segment-level timestamps for post-processing
 * @param options - Transcription options
 * @returns Transcription with segments
 */
async function transcribeWithSegmentsInternal(options: {
  audioFile: File | Blob;
  language?: string;
  prompt?: string;
}): Promise<{
  text: string;
  segments: Array<{
    id: number;
    start: number; // Start time in seconds
    end: number; // End time in seconds
    text: string;
  }>;
  language?: string;
  duration?: number;
}> {
  logger.info('Transcribing audio with segments');

  const result = await transcribeAudioInternal({
    audioFile: options.audioFile,
    language: options.language,
    prompt: options.prompt,
    timestampGranularity: 'segment',
  });

  if (!result.segments) {
    throw new Error('Failed to generate segments');
  }

  logger.info({ segmentCount: result.segments.length }, 'Segments generated');

  return {
    text: result.text,
    segments: result.segments,
    language: result.language,
    duration: result.duration,
  };
}

const transcribeWithSegmentsWithBreaker = createCircuitBreaker(transcribeWithSegmentsInternal, {
  timeout: 120000,
  name: 'whisper:transcribeWithSegments',
});

export const transcribeWithSegments = withRateLimit(
  (options: Parameters<typeof transcribeWithSegmentsInternal>[0]) =>
    transcribeWithSegmentsWithBreaker.fire(options),
  whisperRateLimiter
);

/**
 * Generate SRT subtitle file from audio
 * @param options - Subtitle generation options
 * @returns SRT formatted subtitle string
 */
async function generateSubtitlesInternal(options: {
  audioFile: File | Blob;
  language?: string;
}): Promise<{
  srt: string; // SRT formatted subtitle file
  vtt: string; // WebVTT formatted subtitle file
}> {
  logger.info('Generating subtitles from audio');

  const openai = getOpenAIClient();

  // Get SRT format
  const srtResult = await openai.audio.transcriptions.create({
    file: options.audioFile,
    model: 'whisper-1',
    language: options.language,
    response_format: 'srt',
  });

  // Get VTT format
  const vttResult = await openai.audio.transcriptions.create({
    file: options.audioFile,
    model: 'whisper-1',
    language: options.language,
    response_format: 'vtt',
  });

  logger.info('Subtitles generated in SRT and VTT formats');

  return {
    srt: srtResult as unknown as string,
    vtt: vttResult as unknown as string,
  };
}

const generateSubtitlesWithBreaker = createCircuitBreaker(generateSubtitlesInternal, {
  timeout: 120000,
  name: 'whisper:generateSubtitles',
});

export const generateSubtitles = withRateLimit(
  (options: Parameters<typeof generateSubtitlesInternal>[0]) =>
    generateSubtitlesWithBreaker.fire(options),
  whisperRateLimiter
);

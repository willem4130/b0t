/* eslint-disable */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '@/lib/logger';
import { createCircuitBreaker } from '@/lib/resilience';
import { withRateLimit } from '@/lib/rate-limiter';

/**
 * ElevenLabs Text-to-Speech Module
 *
 * Features:
 * - Generate speech from text
 * - Voice cloning
 * - Multi-language support
 * - Voice design and customization
 * - Circuit breaker protection
 * - Rate limiting (30 req/min)
 * - Structured logging
 *
 * API Reference: https://docs.elevenlabs.io/
 */

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// Rate limiter: 30 requests per minute
const elevenlabsRateLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 2000, // 2 seconds between requests
  reservoir: 30,
  reservoirRefreshAmount: 30,
  reservoirRefreshInterval: 60 * 1000,
});

/**
 * Make authenticated request to ElevenLabs API
 */
async function elevenlabsRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  const url = `${ELEVENLABS_API_BASE}${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making ElevenLabs API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'ElevenLabs API request failed');
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  // Return blob for audio responses
  if (response.headers.get('content-type')?.includes('audio')) {
    return response.blob() as unknown as T;
  }

  return response.json();
}

/**
 * Generate speech from text
 * @param options - Text-to-speech options
 * @returns Audio blob
 */
async function generateSpeechInternal(options: {
  text: string;
  voiceId?: string; // Voice ID (default: use first available)
  modelId?: string; // Model ID (default: eleven_monolingual_v1)
  stability?: number; // 0-1, voice stability
  similarityBoost?: number; // 0-1, voice similarity
  style?: number; // 0-1, style exaggeration
  speakerBoost?: boolean; // Boost speaker similarity
}): Promise<{
  audio: Blob;
  characterCount: number;
}> {
  logger.info({ textLength: options.text.length, voiceId: options.voiceId }, 'Generating speech');

  const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default: Bella voice

  const audio = await elevenlabsRequest<Blob>(`/text-to-speech/${voiceId}`, {
    method: 'POST',
    body: JSON.stringify({
      text: options.text,
      model_id: options.modelId || 'eleven_monolingual_v1',
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
        style: options.style ?? 0,
        use_speaker_boost: options.speakerBoost ?? true,
      },
    }),
  });

  logger.info({ audioSize: audio.size, characterCount: options.text.length }, 'Speech generated');

  return {
    audio,
    characterCount: options.text.length,
  };
}

const generateSpeechWithBreaker = createCircuitBreaker(generateSpeechInternal, {
  timeout: 60000,
  name: 'elevenlabs:generateSpeech',
});

export const generateSpeech = withRateLimit(
  (options: Parameters<typeof generateSpeechInternal>[0]) =>
    generateSpeechWithBreaker.fire(options),
  elevenlabsRateLimiter
);

/**
 * Generate speech with streaming
 * @param options - Streaming TTS options
 * @returns Stream of audio chunks
 */
async function generateSpeechStreamInternal(options: {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  logger.info({ textLength: options.text.length }, 'Starting speech stream');

  const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';

  const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: options.text,
      model_id: options.modelId || 'eleven_monolingual_v1',
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
      },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to start speech stream: ${response.statusText}`);
  }

  logger.info('Speech stream started');

  return response.body;
}

const generateSpeechStreamWithBreaker = createCircuitBreaker(generateSpeechStreamInternal, {
  timeout: 60000,
  name: 'elevenlabs:generateSpeechStream',
});

export const generateSpeechStream = withRateLimit(
  (options: Parameters<typeof generateSpeechStreamInternal>[0]) =>
    generateSpeechStreamWithBreaker.fire(options),
  elevenlabsRateLimiter
);

/**
 * List available voices
 * @returns List of voices
 */
async function listVoicesInternal(): Promise<{
  voices: Array<{
    voiceId: string;
    name: string;
    category: string;
    description?: string;
    labels: Record<string, string>;
    previewUrl?: string;
  }>;
}> {
  logger.info('Listing available voices');

  const result = await elevenlabsRequest<{
    voices: Array<{
      voice_id: string;
      name: string;
      category: string;
      description?: string;
      labels: Record<string, string>;
      preview_url?: string;
    }>;
  }>('/voices', {
    method: 'GET',
  });

  logger.info({ count: result.voices.length }, 'Voices retrieved');

  return {
    voices: result.voices.map((voice) => ({
      voiceId: voice.voice_id,
      name: voice.name,
      category: voice.category,
      description: voice.description,
      labels: voice.labels,
      previewUrl: voice.preview_url,
    })),
  };
}

const listVoicesWithBreaker = createCircuitBreaker(listVoicesInternal, {
  timeout: 10000,
  name: 'elevenlabs:listVoices',
});

export const listVoices = withRateLimit(
  () => listVoicesWithBreaker.fire(),
  elevenlabsRateLimiter
);

/**
 * Get voice details
 * @param voiceId - Voice ID to get details for
 * @returns Voice details
 */
async function getVoiceDetailsInternal(voiceId: string): Promise<{
  voiceId: string;
  name: string;
  category: string;
  description?: string;
  labels: Record<string, string>;
  samples?: Array<{
    sampleId: string;
    fileName: string;
    audioUrl: string;
  }>;
}> {
  logger.info({ voiceId }, 'Getting voice details');

  const result = await elevenlabsRequest<{
    voice_id: string;
    name: string;
    category: string;
    description?: string;
    labels: Record<string, string>;
    samples?: Array<{
      sample_id: string;
      file_name: string;
      audio_url: string;
    }>;
  }>(`/voices/${voiceId}`, {
    method: 'GET',
  });

  logger.info({ voiceId: result.voice_id, name: result.name }, 'Voice details retrieved');

  return {
    voiceId: result.voice_id,
    name: result.name,
    category: result.category,
    description: result.description,
    labels: result.labels,
    samples: result.samples?.map((sample) => ({
      sampleId: sample.sample_id,
      fileName: sample.file_name,
      audioUrl: sample.audio_url,
    })),
  };
}

const getVoiceDetailsWithBreaker = createCircuitBreaker(getVoiceDetailsInternal, {
  timeout: 10000,
  name: 'elevenlabs:getVoiceDetails',
});

export const getVoiceDetails = withRateLimit(
  (voiceId: string) => getVoiceDetailsWithBreaker.fire(voiceId),
  elevenlabsRateLimiter
);

/**
 * Clone voice from audio samples
 * @param options - Voice cloning options
 * @returns Cloned voice ID
 */
async function cloneVoiceInternal(options: {
  name: string;
  description?: string;
  files: File[]; // Audio samples (at least 1, max 25)
  labels?: Record<string, string>;
}): Promise<{
  voiceId: string;
  name: string;
}> {
  logger.info({ name: options.name, fileCount: options.files.length }, 'Cloning voice');

  const formData = new FormData();
  formData.append('name', options.name);
  if (options.description) {
    formData.append('description', options.description);
  }
  if (options.labels) {
    formData.append('labels', JSON.stringify(options.labels));
  }

  // Add audio files
  options.files.forEach((file, index) => {
    formData.append('files', file, `sample_${index}.mp3`);
  });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  const response = await fetch(`${ELEVENLABS_API_BASE}/voices/add`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to clone voice: ${error}`);
  }

  const result = await response.json();

  logger.info({ voiceId: result.voice_id, name: result.name }, 'Voice cloned successfully');

  return {
    voiceId: result.voice_id,
    name: result.name,
  };
}

const cloneVoiceWithBreaker = createCircuitBreaker(cloneVoiceInternal, {
  timeout: 120000, // 2 minutes for voice cloning
  name: 'elevenlabs:cloneVoice',
});

export const cloneVoice = withRateLimit(
  (options: Parameters<typeof cloneVoiceInternal>[0]) =>
    cloneVoiceWithBreaker.fire(options),
  elevenlabsRateLimiter
);

/**
 * Delete cloned voice
 * @param voiceId - Voice ID to delete
 * @returns Deletion confirmation
 */
async function deleteVoiceInternal(voiceId: string): Promise<{
  success: boolean;
  message: string;
}> {
  logger.info({ voiceId }, 'Deleting voice');

  await elevenlabsRequest(`/voices/${voiceId}`, {
    method: 'DELETE',
  });

  logger.info({ voiceId }, 'Voice deleted');

  return {
    success: true,
    message: 'Voice deleted successfully',
  };
}

const deleteVoiceWithBreaker = createCircuitBreaker(deleteVoiceInternal, {
  timeout: 10000,
  name: 'elevenlabs:deleteVoice',
});

export const deleteVoice = withRateLimit(
  (voiceId: string) => deleteVoiceWithBreaker.fire(voiceId),
  elevenlabsRateLimiter
);

/**
 * Get user subscription info
 * @returns Subscription details
 */
async function getSubscriptionInfoInternal(): Promise<{
  characterCount: number;
  characterLimit: number;
  canExtendCharacterLimit: boolean;
  voiceCount: number;
  voiceLimit: number;
}> {
  logger.info('Fetching subscription info');

  const result = await elevenlabsRequest<{
    character_count: number;
    character_limit: number;
    can_extend_character_limit: boolean;
    voice_count: number;
    voice_limit: number;
  }>('/user/subscription', {
    method: 'GET',
  });

  logger.info(
    {
      characterCount: result.character_count,
      characterLimit: result.character_limit,
    },
    'Subscription info retrieved'
  );

  return {
    characterCount: result.character_count,
    characterLimit: result.character_limit,
    canExtendCharacterLimit: result.can_extend_character_limit,
    voiceCount: result.voice_count,
    voiceLimit: result.voice_limit,
  };
}

const getSubscriptionInfoWithBreaker = createCircuitBreaker(getSubscriptionInfoInternal, {
  timeout: 10000,
  name: 'elevenlabs:getSubscriptionInfo',
});

export const getSubscriptionInfo = withRateLimit(
  () => getSubscriptionInfoWithBreaker.fire(),
  elevenlabsRateLimiter
);

/**
 * Get available models
 * @returns List of available TTS models
 */
async function getModelsInternal(): Promise<{
  models: Array<{
    modelId: string;
    name: string;
    canBeFinetuned: boolean;
    canDoTextToSpeech: boolean;
    canDoVoiceConversion: boolean;
    languages: string[];
  }>;
}> {
  logger.info('Fetching available models');

  const result = await elevenlabsRequest<
    Array<{
      model_id: string;
      name: string;
      can_be_finetuned: boolean;
      can_do_text_to_speech: boolean;
      can_do_voice_conversion: boolean;
      languages: Array<{ language_id: string; name: string }>;
    }>
  >('/models', {
    method: 'GET',
  });

  logger.info({ count: result.length }, 'Models retrieved');

  return {
    models: result.map((model) => ({
      modelId: model.model_id,
      name: model.name,
      canBeFinetuned: model.can_be_finetuned,
      canDoTextToSpeech: model.can_do_text_to_speech,
      canDoVoiceConversion: model.can_do_voice_conversion,
      languages: model.languages.map((lang) => lang.language_id),
    })),
  };
}

const getModelsWithBreaker = createCircuitBreaker(getModelsInternal, {
  timeout: 10000,
  name: 'elevenlabs:getModels',
});

export const getModels = withRateLimit(
  () => getModelsWithBreaker.fire(),
  elevenlabsRateLimiter
);

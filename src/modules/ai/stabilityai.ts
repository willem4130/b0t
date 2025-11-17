import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Stability AI Image Generation Module
 *
 * State-of-the-art image generation and editing.
 * Features:
 * - Circuit breaker for fault tolerance
 * - Rate limiting (50 requests/min)
 * - Structured logging
 * - 60s timeout for operations
 *
 * Use cases:
 * - Text-to-image generation
 * - Image upscaling
 * - Image editing
 * - Background removal
 * - Style transfer
 */

if (!process.env.STABILITY_API_KEY) {
  logger.warn('⚠️  STABILITY_API_KEY is not set. Stability AI features will not work.');
}

const STABILITY_API_URL = 'https://api.stability.ai/v1';

// Rate limiter: 50 requests per minute
const stabilityRateLimiter = createRateLimiter({
  maxConcurrent: 2,
  minTime: 1200,
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000,
  id: 'stability-api',
});

interface StabilityImage {
  base64: string;
  finishReason: string;
  seed: number;
}

/**
 * Helper function to make API requests
 */
async function stabilityApiRequest(
  endpoint: string,
  method: string = 'POST',
  body?: FormData | Record<string, unknown>
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
    'Accept': 'application/json',
  };

  // Only set Content-Type for JSON bodies, FormData sets its own
  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const response = await fetch(`${STABILITY_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stability AI error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Generate image from text prompt
 *
 * @param prompt - Text description of the image
 * @param negativePrompt - What to avoid in the image
 * @param width - Image width (default: 1024)
 * @param height - Image height (default: 1024)
 * @param samples - Number of images to generate (default: 1)
 * @param steps - Number of diffusion steps (default: 30)
 * @param cfgScale - How strictly to follow the prompt (default: 7)
 * @param engine - Model to use (default: 'stable-diffusion-xl-1024-v1-0')
 * @returns Array of generated images
 */
async function generateImageInternal(
  prompt: string,
  negativePrompt?: string,
  width: number = 1024,
  height: number = 1024,
  samples: number = 1,
  steps: number = 30,
  cfgScale: number = 7,
  engine: string = 'stable-diffusion-xl-1024-v1-0'
): Promise<StabilityImage[]> {
  logger.info(
    { promptLength: prompt.length, width, height, samples, steps },
    'Generating image with Stability AI'
  );

  const body = {
    text_prompts: [
      {
        text: prompt,
        weight: 1,
      },
      ...(negativePrompt
        ? [
            {
              text: negativePrompt,
              weight: -1,
            },
          ]
        : []),
    ],
    width,
    height,
    samples,
    steps,
    cfg_scale: cfgScale,
  };

  const result = await stabilityApiRequest(`/generation/${engine}/text-to-image`, 'POST', body);

  logger.info({ imageCount: ((result as { artifacts: unknown[] }).artifacts || []).length }, 'Images generated');

  return ((result as { artifacts: StabilityImage[] }).artifacts || []).map(artifact => ({
    base64: artifact.base64,
    finishReason: artifact.finishReason,
    seed: artifact.seed,
  }));
}

const generateImageWithBreaker = createCircuitBreaker(generateImageInternal, {
  timeout: 60000,
  name: 'stability:generateImage',
});

/**
 * Generate image from text prompt (protected)
 */
export const generateImage = withRateLimit(
  (
    prompt: string,
    negativePrompt?: string,
    width?: number,
    height?: number,
    samples?: number,
    steps?: number,
    cfgScale?: number,
    engine?: string
  ) =>
    generateImageWithBreaker.fire(
      prompt,
      negativePrompt,
      width,
      height,
      samples,
      steps,
      cfgScale,
      engine
    ),
  stabilityRateLimiter
);

/**
 * Upscale an image
 *
 * @param imageBase64 - Base64-encoded image
 * @param width - Target width (optional, uses smart upscaling if not provided)
 * @param height - Target height (optional)
 * @param engine - Upscaling engine (default: 'esrgan-v1-x2plus')
 * @returns Upscaled image
 */
async function upscaleImageInternal(
  imageBase64: string,
  width?: number,
  height?: number,
  engine: string = 'esrgan-v1-x2plus'
): Promise<StabilityImage> {
  logger.info({ hasImage: true, width, height, engine }, 'Upscaling image with Stability AI');

  const formData = new FormData();

  // Convert base64 to blob
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const binaryData = Buffer.from(base64Data, 'base64');
  const blob = new Blob([binaryData], { type: 'image/png' });

  formData.append('image', blob, 'image.png');
  if (width) formData.append('width', width.toString());
  if (height) formData.append('height', height.toString());

  const result = await stabilityApiRequest(`/generation/${engine}/image-to-image/upscale`, 'POST', formData);

  logger.info('Image upscaled successfully');

  const artifacts = (result as { artifacts: StabilityImage[] }).artifacts || [];
  return artifacts[0] || { base64: '', finishReason: 'error', seed: 0 };
}

const upscaleImageWithBreaker = createCircuitBreaker(upscaleImageInternal, {
  timeout: 60000,
  name: 'stability:upscaleImage',
});

/**
 * Upscale an image (protected)
 */
export const upscaleImage = withRateLimit(
  (imageBase64: string, width?: number, height?: number, engine?: string) =>
    upscaleImageWithBreaker.fire(imageBase64, width, height, engine),
  stabilityRateLimiter
);

/**
 * Edit an image using a mask
 *
 * @param imageBase64 - Base64-encoded original image
 * @param maskBase64 - Base64-encoded mask (white = edit area)
 * @param prompt - Description of desired edit
 * @param engine - Model to use (default: 'stable-diffusion-xl-1024-v1-0')
 * @returns Edited image
 */
async function editImageInternal(
  imageBase64: string,
  maskBase64: string,
  prompt: string,
  engine: string = 'stable-diffusion-xl-1024-v1-0'
): Promise<StabilityImage> {
  logger.info({ hasImage: true, hasMask: true, promptLength: prompt.length }, 'Editing image with Stability AI');

  const formData = new FormData();

  // Convert base64 to blobs
  const imageData = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBinary = Buffer.from(imageData, 'base64');
  const imageBlob = new Blob([imageBinary], { type: 'image/png' });

  const maskData = maskBase64.replace(/^data:image\/\w+;base64,/, '');
  const maskBinary = Buffer.from(maskData, 'base64');
  const maskBlob = new Blob([maskBinary], { type: 'image/png' });

  formData.append('init_image', imageBlob, 'image.png');
  formData.append('mask_image', maskBlob, 'mask.png');
  formData.append('text_prompts[0][text]', prompt);
  formData.append('text_prompts[0][weight]', '1');

  const result = await stabilityApiRequest(`/generation/${engine}/image-to-image/masking`, 'POST', formData);

  logger.info('Image edited successfully');

  const artifacts = (result as { artifacts: StabilityImage[] }).artifacts || [];
  return artifacts[0] || { base64: '', finishReason: 'error', seed: 0 };
}

const editImageWithBreaker = createCircuitBreaker(editImageInternal, {
  timeout: 60000,
  name: 'stability:editImage',
});

/**
 * Edit an image using a mask (protected)
 */
export const editImage = withRateLimit(
  (imageBase64: string, maskBase64: string, prompt: string, engine?: string) =>
    editImageWithBreaker.fire(imageBase64, maskBase64, prompt, engine),
  stabilityRateLimiter
);

/**
 * Remove background from an image
 *
 * @param imageBase64 - Base64-encoded image
 * @returns Image with transparent background
 */
async function removeBackgroundInternal(imageBase64: string): Promise<StabilityImage> {
  logger.info({ hasImage: true }, 'Removing background with Stability AI');

  const formData = new FormData();

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const binaryData = Buffer.from(base64Data, 'base64');
  const blob = new Blob([binaryData], { type: 'image/png' });

  formData.append('image', blob, 'image.png');
  formData.append('output_format', 'png');

  const result = await stabilityApiRequest('/generation/stable-diffusion-xl-1024-v1-0/image-to-image/masking', 'POST', formData);

  logger.info('Background removed successfully');

  const artifacts = (result as { artifacts: StabilityImage[] }).artifacts || [];
  return artifacts[0] || { base64: '', finishReason: 'error', seed: 0 };
}

const removeBackgroundWithBreaker = createCircuitBreaker(removeBackgroundInternal, {
  timeout: 60000,
  name: 'stability:removeBackground',
});

/**
 * Remove background from an image (protected)
 */
export const removeBackground = withRateLimit(
  (imageBase64: string) => removeBackgroundWithBreaker.fire(imageBase64),
  stabilityRateLimiter
);

/**
 * Image-to-image transformation
 *
 * @param imageBase64 - Base64-encoded source image
 * @param prompt - Description of desired transformation
 * @param strength - How much to transform (0-1, default: 0.5)
 * @param steps - Number of diffusion steps (default: 30)
 * @param engine - Model to use (default: 'stable-diffusion-xl-1024-v1-0')
 * @returns Transformed image
 */
async function imageToImageInternal(
  imageBase64: string,
  prompt: string,
  strength: number = 0.5,
  steps: number = 30,
  engine: string = 'stable-diffusion-xl-1024-v1-0'
): Promise<StabilityImage> {
  logger.info({ hasImage: true, promptLength: prompt.length, strength, steps }, 'Transforming image');

  const formData = new FormData();

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const binaryData = Buffer.from(base64Data, 'base64');
  const blob = new Blob([binaryData], { type: 'image/png' });

  formData.append('init_image', blob, 'image.png');
  formData.append('text_prompts[0][text]', prompt);
  formData.append('text_prompts[0][weight]', '1');
  formData.append('image_strength', strength.toString());
  formData.append('steps', steps.toString());

  const result = await stabilityApiRequest(`/generation/${engine}/image-to-image`, 'POST', formData);

  logger.info('Image transformed successfully');

  const artifacts = (result as { artifacts: StabilityImage[] }).artifacts || [];
  return artifacts[0] || { base64: '', finishReason: 'error', seed: 0 };
}

const imageToImageWithBreaker = createCircuitBreaker(imageToImageInternal, {
  timeout: 60000,
  name: 'stability:imageToImage',
});

/**
 * Image-to-image transformation (protected)
 */
export const imageToImage = withRateLimit(
  (imageBase64: string, prompt: string, strength?: number, steps?: number, engine?: string) =>
    imageToImageWithBreaker.fire(imageBase64, prompt, strength, steps, engine),
  stabilityRateLimiter
);

/**
 * List available engines/models
 *
 * @returns Array of available engines
 */
async function listEnginesInternal(): Promise<{
  engines: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
  }>;
}> {
  logger.info('Listing Stability AI engines');

  const result = await stabilityApiRequest('/engines/list', 'GET');

  logger.info({ count: (result as { engines?: unknown[] }).engines?.length || 0 }, 'Engines listed');

  return result as {
    engines: Array<{
      id: string;
      name: string;
      description: string;
      type: string;
    }>;
  };
}

const listEnginesWithBreaker = createCircuitBreaker(listEnginesInternal, {
  timeout: 30000,
  name: 'stability:listEngines',
});

/**
 * List available engines/models (protected)
 */
export const listEngines = withRateLimit(() => listEnginesWithBreaker.fire(), stabilityRateLimiter);

/**
 * Get account balance/credits
 *
 * @returns Account balance information
 */
async function getBalanceInternal(): Promise<{ credits: number }> {
  logger.info('Getting Stability AI account balance');

  const result = await stabilityApiRequest('/user/balance', 'GET');

  logger.info({ credits: (result as { credits: number }).credits }, 'Balance retrieved');

  return result as { credits: number };
}

const getBalanceWithBreaker = createCircuitBreaker(getBalanceInternal, {
  timeout: 30000,
  name: 'stability:getBalance',
});

/**
 * Get account balance/credits (protected)
 */
export const getBalance = withRateLimit(() => getBalanceWithBreaker.fire(), stabilityRateLimiter);

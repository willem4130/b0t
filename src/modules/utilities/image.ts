import sharp from 'sharp';
import { logger } from '@/lib/logger';

/**
 * Image Processing Module
 *
 * Transform, optimize, and manipulate images
 * - Resize and crop images
 * - Convert formats (JPEG, PNG, WebP, AVIF)
 * - Optimize for web
 * - Add watermarks and overlays
 * - Generate thumbnails
 *
 * Perfect for:
 * - Image optimization pipelines
 * - Thumbnail generation
 * - Format conversion
 * - Social media image preparation
 */

export interface ImageResizeOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: string;
  withoutEnlargement?: boolean;
}

export interface ImageFormatOptions {
  format: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';
  quality?: number;
}

/**
 * Resize image
 */
export async function resizeImage(
  input: Buffer | string,
  options: ImageResizeOptions
): Promise<Buffer> {
  logger.info({ options }, 'Resizing image');

  try {
    const result = await sharp(input)
      .resize({
        width: options.width,
        height: options.height,
        fit: options.fit || 'cover',
        position: options.position,
        withoutEnlargement: options.withoutEnlargement,
      })
      .toBuffer();

    logger.info({ outputSize: result.length }, 'Image resized successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to resize image');
    throw new Error(
      `Failed to resize image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert image format
 */
export async function convertImageFormat(
  input: Buffer | string,
  options: ImageFormatOptions
): Promise<Buffer> {
  logger.info({ format: options.format, quality: options.quality }, 'Converting image format');

  try {
    let pipeline = sharp(input);

    switch (options.format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: options.quality || 80 });
        break;
      case 'png':
        pipeline = pipeline.png({ quality: options.quality || 80 });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: options.quality || 80 });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality: options.quality || 80 });
        break;
      case 'gif':
        pipeline = pipeline.gif();
        break;
    }

    const result = await pipeline.toBuffer();

    logger.info({ outputSize: result.length }, 'Image format converted successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to convert image format');
    throw new Error(
      `Failed to convert image format: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Optimize image for web
 */
export async function optimizeImage(
  input: Buffer | string,
  quality: number = 80
): Promise<Buffer> {
  logger.info({ quality }, 'Optimizing image for web');

  try {
    const result = await sharp(input)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    logger.info(
      {
        inputSize: typeof input === 'string' ? 'file' : input.length,
        outputSize: result.length,
      },
      'Image optimized successfully'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to optimize image');
    throw new Error(
      `Failed to optimize image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate thumbnail
 */
export async function generateThumbnail(
  input: Buffer | string,
  size: number = 200
): Promise<Buffer> {
  logger.info({ size }, 'Generating thumbnail');

  try {
    const result = await sharp(input)
      .resize(size, size, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    logger.info({ thumbnailSize: result.length }, 'Thumbnail generated successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to generate thumbnail');
    throw new Error(
      `Failed to generate thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Crop image
 */
export async function cropImage(
  input: Buffer | string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<Buffer> {
  logger.info({ x, y, width, height }, 'Cropping image');

  try {
    const result = await sharp(input)
      .extract({ left: x, top: y, width, height })
      .toBuffer();

    logger.info({ croppedSize: result.length }, 'Image cropped successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to crop image');
    throw new Error(
      `Failed to crop image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Add watermark to image
 */
export async function addWatermark(
  input: Buffer | string,
  watermark: Buffer | string,
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' = 'bottom-right'
): Promise<Buffer> {
  logger.info({ position }, 'Adding watermark to image');

  try {
    const image = sharp(input);
    await image.metadata();

    let gravity: string;
    switch (position) {
      case 'top-left':
        gravity = 'northwest';
        break;
      case 'top-right':
        gravity = 'northeast';
        break;
      case 'bottom-left':
        gravity = 'southwest';
        break;
      case 'bottom-right':
        gravity = 'southeast';
        break;
      case 'center':
        gravity = 'center';
        break;
    }

    const result = await image
      .composite([
        {
          input: watermark as Buffer,
          gravity: gravity as never,
        },
      ])
      .toBuffer();

    logger.info({ outputSize: result.length }, 'Watermark added successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to add watermark');
    throw new Error(
      `Failed to add watermark: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get image metadata
 */
export async function getImageMetadata(input: Buffer | string): Promise<{
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  channels?: number;
  hasAlpha?: boolean;
}> {
  logger.info('Getting image metadata');

  try {
    const metadata = await sharp(input).metadata();

    logger.info({ metadata }, 'Image metadata retrieved');

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get image metadata');
    throw new Error(
      `Failed to get image metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Rotate image
 */
export async function rotateImage(
  input: Buffer | string,
  angle: number
): Promise<Buffer> {
  logger.info({ angle }, 'Rotating image');

  try {
    const result = await sharp(input).rotate(angle).toBuffer();

    logger.info({ outputSize: result.length }, 'Image rotated successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to rotate image');
    throw new Error(
      `Failed to rotate image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Flip image
 */
export async function flipImage(
  input: Buffer | string,
  direction: 'horizontal' | 'vertical' = 'horizontal'
): Promise<Buffer> {
  logger.info({ direction }, 'Flipping image');

  try {
    let result;
    if (direction === 'horizontal') {
      result = await sharp(input).flop().toBuffer();
    } else {
      result = await sharp(input).flip().toBuffer();
    }

    logger.info({ outputSize: result.length }, 'Image flipped successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to flip image');
    throw new Error(
      `Failed to flip image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Apply blur to image
 */
export async function blurImage(
  input: Buffer | string,
  sigma: number = 5
): Promise<Buffer> {
  logger.info({ sigma }, 'Applying blur to image');

  try {
    const result = await sharp(input).blur(sigma).toBuffer();

    logger.info({ outputSize: result.length }, 'Blur applied successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to apply blur');
    throw new Error(
      `Failed to apply blur: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Sharpen image
 */
export async function sharpenImage(
  input: Buffer | string,
  sigma: number = 1
): Promise<Buffer> {
  logger.info({ sigma }, 'Sharpening image');

  try {
    const result = await sharp(input).sharpen(sigma).toBuffer();

    logger.info({ outputSize: result.length }, 'Image sharpened successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to sharpen image');
    throw new Error(
      `Failed to sharpen image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert image to grayscale
 */
export async function toGrayscale(input: Buffer | string): Promise<Buffer> {
  logger.info('Converting image to grayscale');

  try {
    const result = await sharp(input).grayscale().toBuffer();

    logger.info({ outputSize: result.length }, 'Image converted to grayscale');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to convert to grayscale');
    throw new Error(
      `Failed to convert to grayscale: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

import archiver from 'archiver';
import unzipper from 'unzipper';
import zlib from 'zlib';
import { promisify } from 'util';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from '@/lib/logger';

/**
 * Compression Module
 *
 * Compress and decompress files and data
 * - ZIP archives (create, extract)
 * - GZIP compression
 * - Deflate/Inflate
 * - Brotli compression
 * - Stream-based operations
 *
 * Perfect for:
 * - File backup workflows
 * - Data transfer optimization
 * - Archive management
 * - API payload compression
 */

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const deflateAsync = promisify(zlib.deflate);
const inflateAsync = promisify(zlib.inflate);
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

/**
 * Compress string with GZIP
 */
export async function compressGzip(data: string | Buffer): Promise<Buffer> {
  logger.info({ size: data.length }, 'Compressing with GZIP');

  try {
    const input = typeof data === 'string' ? Buffer.from(data) : data;
    const compressed = await gzipAsync(input);

    logger.info(
      {
        originalSize: input.length,
        compressedSize: compressed.length,
        ratio: ((1 - compressed.length / input.length) * 100).toFixed(2) + '%',
      },
      'GZIP compression completed'
    );

    return compressed;
  } catch (error) {
    logger.error({ error }, 'Failed to compress with GZIP');
    throw new Error(
      `Failed to compress with GZIP: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decompress GZIP data
 */
export async function decompressGzip(data: Buffer): Promise<Buffer> {
  logger.info({ size: data.length }, 'Decompressing GZIP');

  try {
    const decompressed = await gunzipAsync(data);

    logger.info({ decompressedSize: decompressed.length }, 'GZIP decompression completed');

    return decompressed;
  } catch (error) {
    logger.error({ error }, 'Failed to decompress GZIP');
    throw new Error(
      `Failed to decompress GZIP: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Compress with Deflate
 */
export async function compressDeflate(data: string | Buffer): Promise<Buffer> {
  logger.info({ size: data.length }, 'Compressing with Deflate');

  try {
    const input = typeof data === 'string' ? Buffer.from(data) : data;
    const compressed = await deflateAsync(input);

    logger.info({ compressedSize: compressed.length }, 'Deflate compression completed');

    return compressed;
  } catch (error) {
    logger.error({ error }, 'Failed to compress with Deflate');
    throw new Error(
      `Failed to compress with Deflate: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decompress Deflate data
 */
export async function decompressDeflate(data: Buffer): Promise<Buffer> {
  logger.info({ size: data.length }, 'Decompressing Deflate');

  try {
    const decompressed = await inflateAsync(data);

    logger.info({ decompressedSize: decompressed.length }, 'Deflate decompression completed');

    return decompressed;
  } catch (error) {
    logger.error({ error }, 'Failed to decompress Deflate');
    throw new Error(
      `Failed to decompress Deflate: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Compress with Brotli
 */
export async function compressBrotli(data: string | Buffer): Promise<Buffer> {
  logger.info({ size: data.length }, 'Compressing with Brotli');

  try {
    const input = typeof data === 'string' ? Buffer.from(data) : data;
    const compressed = await brotliCompressAsync(input);

    logger.info(
      {
        originalSize: input.length,
        compressedSize: compressed.length,
        ratio: ((1 - compressed.length / input.length) * 100).toFixed(2) + '%',
      },
      'Brotli compression completed'
    );

    return compressed;
  } catch (error) {
    logger.error({ error }, 'Failed to compress with Brotli');
    throw new Error(
      `Failed to compress with Brotli: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decompress Brotli data
 */
export async function decompressBrotli(data: Buffer): Promise<Buffer> {
  logger.info({ size: data.length }, 'Decompressing Brotli');

  try {
    const decompressed = await brotliDecompressAsync(data);

    logger.info({ decompressedSize: decompressed.length }, 'Brotli decompression completed');

    return decompressed;
  } catch (error) {
    logger.error({ error }, 'Failed to decompress Brotli');
    throw new Error(
      `Failed to decompress Brotli: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create ZIP archive
 */
export async function createZip(
  outputPath: string,
  files: Array<{ path: string; name?: string; content?: string | Buffer }>
): Promise<void> {
  logger.info({ outputPath, fileCount: files.length }, 'Creating ZIP archive');

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      logger.info(
        {
          outputPath,
          fileCount: files.length,
          totalBytes: archive.pointer(),
        },
        'ZIP archive created'
      );
      resolve();
    });

    archive.on('error', (error: Error) => {
      logger.error({ error, outputPath }, 'Failed to create ZIP archive');
      reject(error);
    });

    archive.pipe(output);

    for (const file of files) {
      if (file.content) {
        // Add from content
        archive.append(file.content, { name: file.name || 'file.txt' });
      } else {
        // Add from file
        archive.file(file.path, { name: file.name || file.path });
      }
    }

    archive.finalize();
  });
}

/**
 * Extract ZIP archive
 */
export async function extractZip(
  zipPath: string,
  outputDir: string
): Promise<Array<{ path: string; type: string; size: number }>> {
  logger.info({ zipPath, outputDir }, 'Extracting ZIP archive');

  try {
    const files: Array<{ path: string; type: string; size: number }> = [];

    await pipeline(
      createReadStream(zipPath),
      unzipper.Extract({ path: outputDir })
    );

    // Note: unzipper doesn't provide file list directly during extraction
    // In production, you might want to use a different approach to track files

    logger.info({ zipPath, outputDir }, 'ZIP archive extracted');

    return files;
  } catch (error) {
    logger.error({ error, zipPath, outputDir }, 'Failed to extract ZIP archive');
    throw new Error(
      `Failed to extract ZIP archive: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * List ZIP archive contents
 */
export async function listZipContents(
  zipPath: string
): Promise<Array<{ path: string; type: string; size: number; compressedSize: number }>> {
  logger.info({ zipPath }, 'Listing ZIP contents');

  try {
    const contents: Array<{ path: string; type: string; size: number; compressedSize: number }> = [];

    const directory = await unzipper.Open.file(zipPath);

    for (const file of directory.files) {
      contents.push({
        path: file.path,
        type: file.type,
        size: file.uncompressedSize,
        compressedSize: file.compressedSize,
      });
    }

    logger.info({ zipPath, fileCount: contents.length }, 'ZIP contents listed');

    return contents;
  } catch (error) {
    logger.error({ error, zipPath }, 'Failed to list ZIP contents');
    throw new Error(
      `Failed to list ZIP contents: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Compress file with GZIP
 */
export async function compressFileGzip(inputPath: string, outputPath: string): Promise<void> {
  logger.info({ inputPath, outputPath }, 'Compressing file with GZIP');

  try {
    await pipeline(
      createReadStream(inputPath),
      zlib.createGzip({ level: 9 }),
      createWriteStream(outputPath)
    );

    logger.info({ inputPath, outputPath }, 'File compressed with GZIP');
  } catch (error) {
    logger.error({ error, inputPath, outputPath }, 'Failed to compress file with GZIP');
    throw new Error(
      `Failed to compress file with GZIP: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decompress GZIP file
 */
export async function decompressFileGzip(inputPath: string, outputPath: string): Promise<void> {
  logger.info({ inputPath, outputPath }, 'Decompressing GZIP file');

  try {
    await pipeline(
      createReadStream(inputPath),
      zlib.createGunzip(),
      createWriteStream(outputPath)
    );

    logger.info({ inputPath, outputPath }, 'GZIP file decompressed');
  } catch (error) {
    logger.error({ error, inputPath, outputPath }, 'Failed to decompress GZIP file');
    throw new Error(
      `Failed to decompress GZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Compress directory to ZIP
 */
export async function compressDirectory(directoryPath: string, outputPath: string): Promise<void> {
  logger.info({ directoryPath, outputPath }, 'Compressing directory to ZIP');

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', () => {
      logger.info(
        {
          directoryPath,
          outputPath,
          totalBytes: archive.pointer(),
        },
        'Directory compressed to ZIP'
      );
      resolve();
    });

    archive.on('error', (error: Error) => {
      logger.error({ error, directoryPath, outputPath }, 'Failed to compress directory');
      reject(error);
    });

    archive.pipe(output);
    archive.directory(directoryPath, false);
    archive.finalize();
  });
}

/**
 * Get compression ratio
 */
export function getCompressionRatio(originalSize: number, compressedSize: number): {
  ratio: number;
  percentage: string;
  spaceSaved: number;
} {
  const ratio = originalSize > 0 ? compressedSize / originalSize : 0;
  const percentage = ((1 - ratio) * 100).toFixed(2) + '%';
  const spaceSaved = originalSize - compressedSize;

  return {
    ratio,
    percentage,
    spaceSaved,
  };
}

/**
 * Compress string to base64 GZIP
 */
export async function compressToBase64(data: string): Promise<string> {
  logger.info({ size: data.length }, 'Compressing to base64 GZIP');

  try {
    const compressed = await compressGzip(data);
    const base64 = compressed.toString('base64');

    logger.info(
      {
        originalSize: data.length,
        compressedSize: compressed.length,
        base64Length: base64.length,
      },
      'Compressed to base64 GZIP'
    );

    return base64;
  } catch (error) {
    logger.error({ error }, 'Failed to compress to base64');
    throw new Error(
      `Failed to compress to base64: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decompress base64 GZIP string
 */
export async function decompressFromBase64(base64: string): Promise<string> {
  logger.info({ base64Length: base64.length }, 'Decompressing from base64 GZIP');

  try {
    const buffer = Buffer.from(base64, 'base64');
    const decompressed = await decompressGzip(buffer);
    const text = decompressed.toString('utf8');

    logger.info({ decompressedLength: text.length }, 'Decompressed from base64 GZIP');

    return text;
  } catch (error) {
    logger.error({ error }, 'Failed to decompress from base64');
    throw new Error(
      `Failed to decompress from base64: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

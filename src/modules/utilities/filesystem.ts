import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from '@/lib/logger';

/**
 * File System Module
 *
 * Comprehensive file and directory operations
 * - Read, write, delete files
 * - Create, list, remove directories
 * - Copy, move, rename operations
 * - File metadata and stats
 * - Stream operations for large files
 *
 * Perfect for:
 * - File processing workflows
 * - Data import/export
 * - Backup automation
 * - Content management
 */

export interface FileStats {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  created: Date;
  modified: Date;
  accessed: Date;
}

export interface DirectoryItem {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  size?: number;
}

/**
 * Read file contents as string
 */
export async function readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  logger.info({ filePath, encoding }, 'Reading file');

  try {
    const content = await fs.readFile(filePath, encoding);

    logger.info({ filePath, size: content.length }, 'File read successfully');

    return content;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read file');
    throw new Error(
      `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Read file contents as Buffer
 */
export async function readFileBuffer(filePath: string): Promise<Buffer> {
  logger.info({ filePath }, 'Reading file as buffer');

  try {
    const buffer = await fs.readFile(filePath);

    logger.info({ filePath, size: buffer.length }, 'File buffer read successfully');

    return buffer;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read file buffer');
    throw new Error(
      `Failed to read file buffer: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Write string content to file
 */
export async function writeFile(
  filePath: string,
  content: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  logger.info({ filePath, size: content.length, encoding }, 'Writing file');

  try {
    await fs.writeFile(filePath, content, encoding);

    logger.info({ filePath }, 'File written successfully');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to write file');
    throw new Error(
      `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Write Buffer to file
 */
export async function writeFileBuffer(filePath: string, buffer: Buffer): Promise<void> {
  logger.info({ filePath, size: buffer.length }, 'Writing file buffer');

  try {
    await fs.writeFile(filePath, buffer);

    logger.info({ filePath }, 'File buffer written successfully');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to write file buffer');
    throw new Error(
      `Failed to write file buffer: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Append content to file
 */
export async function appendFile(
  filePath: string,
  content: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  logger.info({ filePath, size: content.length }, 'Appending to file');

  try {
    await fs.appendFile(filePath, content, encoding);

    logger.info({ filePath }, 'Content appended successfully');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to append to file');
    throw new Error(
      `Failed to append to file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete file
 */
export async function deleteFile(filePath: string): Promise<void> {
  logger.info({ filePath }, 'Deleting file');

  try {
    await fs.unlink(filePath);

    logger.info({ filePath }, 'File deleted successfully');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to delete file');
    throw new Error(
      `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file stats
 */
export async function getFileStats(filePath: string): Promise<FileStats> {
  logger.info({ filePath }, 'Getting file stats');

  try {
    const stats = await fs.stat(filePath);

    const fileStats: FileStats = {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
    };

    logger.info({ filePath, stats: fileStats }, 'File stats retrieved');

    return fileStats;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to get file stats');
    throw new Error(
      `Failed to get file stats: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Copy file
 */
export async function copyFile(sourcePath: string, destPath: string): Promise<void> {
  logger.info({ sourcePath, destPath }, 'Copying file');

  try {
    await fs.copyFile(sourcePath, destPath);

    logger.info({ sourcePath, destPath }, 'File copied successfully');
  } catch (error) {
    logger.error({ error, sourcePath, destPath }, 'Failed to copy file');
    throw new Error(
      `Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Move/rename file
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
  logger.info({ sourcePath, destPath }, 'Moving file');

  try {
    await fs.rename(sourcePath, destPath);

    logger.info({ sourcePath, destPath }, 'File moved successfully');
  } catch (error) {
    logger.error({ error, sourcePath, destPath }, 'Failed to move file');
    throw new Error(
      `Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create directory
 */
export async function createDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
  logger.info({ dirPath, recursive }, 'Creating directory');

  try {
    await fs.mkdir(dirPath, { recursive });

    logger.info({ dirPath }, 'Directory created successfully');
  } catch (error) {
    logger.error({ error, dirPath }, 'Failed to create directory');
    throw new Error(
      `Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * List directory contents
 */
export async function listDirectory(
  dirPath: string,
  options: { recursive?: boolean; includeStats?: boolean } = {}
): Promise<DirectoryItem[]> {
  logger.info({ dirPath, options }, 'Listing directory');

  try {
    const items: DirectoryItem[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const item: DirectoryItem = {
        name: entry.name,
        path: fullPath,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      };

      if (options.includeStats && entry.isFile()) {
        const stats = await fs.stat(fullPath);
        item.size = stats.size;
      }

      items.push(item);

      // Recursively list subdirectories
      if (options.recursive && entry.isDirectory()) {
        const subItems = await listDirectory(fullPath, options);
        items.push(...subItems);
      }
    }

    logger.info({ dirPath, itemCount: items.length }, 'Directory listed successfully');

    return items;
  } catch (error) {
    logger.error({ error, dirPath }, 'Failed to list directory');
    throw new Error(
      `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete directory
 */
export async function deleteDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
  logger.info({ dirPath, recursive }, 'Deleting directory');

  try {
    await fs.rm(dirPath, { recursive, force: true });

    logger.info({ dirPath }, 'Directory deleted successfully');
  } catch (error) {
    logger.error({ error, dirPath }, 'Failed to delete directory');
    throw new Error(
      `Failed to delete directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Copy directory
 */
export async function copyDirectory(sourcePath: string, destPath: string): Promise<void> {
  logger.info({ sourcePath, destPath }, 'Copying directory');

  try {
    await fs.cp(sourcePath, destPath, { recursive: true });

    logger.info({ sourcePath, destPath }, 'Directory copied successfully');
  } catch (error) {
    logger.error({ error, sourcePath, destPath }, 'Failed to copy directory');
    throw new Error(
      `Failed to copy directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get file extension
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Get file name without extension
 */
export function getFileName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Get directory name
 */
export function getDirectoryName(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Join paths
 */
export function joinPaths(...paths: string[]): string {
  return path.join(...paths);
}

/**
 * Resolve absolute path
 */
export function resolvePath(...paths: string[]): string {
  return path.resolve(...paths);
}

/**
 * Stream copy file (for large files)
 */
export async function streamCopyFile(sourcePath: string, destPath: string): Promise<void> {
  logger.info({ sourcePath, destPath }, 'Stream copying file');

  try {
    const readStream = createReadStream(sourcePath);
    const writeStream = createWriteStream(destPath);

    await pipeline(readStream, writeStream);

    logger.info({ sourcePath, destPath }, 'File stream copied successfully');
  } catch (error) {
    logger.error({ error, sourcePath, destPath }, 'Failed to stream copy file');
    throw new Error(
      `Failed to stream copy file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Read file line by line
 */
export async function readFileLines(filePath: string): Promise<string[]> {
  logger.info({ filePath }, 'Reading file lines');

  try {
    const content = await readFile(filePath);
    const lines = content.split('\n');

    logger.info({ filePath, lineCount: lines.length }, 'File lines read successfully');

    return lines;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read file lines');
    throw new Error(
      `Failed to read file lines: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Write lines to file
 */
export async function writeFileLines(filePath: string, lines: string[]): Promise<void> {
  logger.info({ filePath, lineCount: lines.length }, 'Writing file lines');

  try {
    const content = lines.join('\n');
    await writeFile(filePath, content);

    logger.info({ filePath }, 'File lines written successfully');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to write file lines');
    throw new Error(
      `Failed to write file lines: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

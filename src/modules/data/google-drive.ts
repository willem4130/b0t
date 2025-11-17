import { Readable } from 'stream';
import { google } from 'googleapis';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Google Drive Module
 *
 * Read, write, and manage files on Google Drive
 * - List files
 * - Upload files
 * - Download files
 * - Delete files
 * - Built-in resilience
 *
 * Perfect for:
 * - Document management
 * - File sharing workflows
 * - Backup automation
 * - Integration with Google Workspace
 */

const GOOGLE_DRIVE_CREDENTIALS = process.env.GOOGLE_DRIVE_CREDENTIALS;

if (!GOOGLE_DRIVE_CREDENTIALS) {
  logger.warn('⚠️  GOOGLE_DRIVE_CREDENTIALS not set. Google Drive features will not work.');
}

// Initialize OAuth2 client
let driveClient: ReturnType<typeof google.drive> | null = null;

if (GOOGLE_DRIVE_CREDENTIALS) {
  try {
    const credentials = JSON.parse(GOOGLE_DRIVE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = google.drive({ version: 'v3', auth });
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Google Drive client');
  }
}

// Rate limiter: Google Drive allows 10 req/sec per user
const googleDriveRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 100, // 100ms between requests = 10/sec
  reservoir: 10,
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 1000,
  id: 'google-drive',
});

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
}

export interface ListFilesOptions {
  parentId?: string;
  pageSize?: number;
  searchQuery?: string;
}

/**
 * List files from Google Drive (internal)
 */
async function listFilesInternal(options: ListFilesOptions): Promise<DriveFile[]> {
  if (!driveClient) {
    throw new Error('Google Drive client not initialized. Set GOOGLE_DRIVE_CREDENTIALS.');
  }

  logger.info(
    {
      parentId: options.parentId,
      pageSize: options.pageSize,
    },
    'Listing Google Drive files'
  );

  const query: string[] = [];
  if (options.parentId) {
    query.push(`'${options.parentId}' in parents`);
  }
  if (options.searchQuery) {
    query.push(`name contains '${options.searchQuery}'`);
  }

  const response = await driveClient.files.list({
    q: query.length > 0 ? query.join(' and ') : undefined,
    spaces: 'drive',
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,size)',
    pageSize: options.pageSize || 10,
  });

  const files: DriveFile[] = (response.data.files || []).map((file) => ({
    id: file.id!,
    name: file.name!,
    mimeType: file.mimeType!,
    createdTime: file.createdTime!,
    modifiedTime: file.modifiedTime!,
    size: file.size || undefined,
  }));

  logger.info({ fileCount: files.length }, 'Google Drive files listed');
  return files;
}

/**
 * List files (protected)
 */
const listFilesWithBreaker = createCircuitBreaker(listFilesInternal, {
  timeout: 10000,
  name: 'google-drive-list-files',
});

export const listFiles = withRateLimit(
  (options: ListFilesOptions) => listFilesWithBreaker.fire(options),
  googleDriveRateLimiter
);

/**
 * Upload file to Google Drive (internal)
 */
async function uploadFileInternal(
  fileName: string,
  fileContent: Buffer,
  parentId?: string,
  mimeType: string = 'application/octet-stream'
): Promise<DriveFile> {
  if (!driveClient) {
    throw new Error('Google Drive client not initialized. Set GOOGLE_DRIVE_CREDENTIALS.');
  }

  logger.info(
    {
      fileName,
      size: fileContent.length,
      parentId,
    },
    'Uploading file to Google Drive'
  );

  const fileMetadata: { name: string; parents?: string[] } = { name: fileName };
  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const response = await driveClient.files.create({
    requestBody: fileMetadata,
    media: {
      mimeType,
      body: Readable.from([fileContent]),
    },
    fields: 'id,name,mimeType,createdTime,modifiedTime,size',
  });

  const file: DriveFile = {
    id: response.data.id!,
    name: response.data.name!,
    mimeType: response.data.mimeType!,
    createdTime: response.data.createdTime!,
    modifiedTime: response.data.modifiedTime!,
    size: response.data.size || undefined,
  };

  logger.info({ fileId: file.id, fileName }, 'File uploaded to Google Drive');
  return file;
}

/**
 * Upload file (protected)
 */
const uploadFileWithBreaker = createCircuitBreaker(uploadFileInternal, {
  timeout: 30000,
  name: 'google-drive-upload-file',
});

export const uploadFile = withRateLimit(
  (fileName: string, fileContent: Buffer, parentId?: string, mimeType?: string) =>
    uploadFileWithBreaker.fire(fileName, fileContent, parentId, mimeType),
  googleDriveRateLimiter
);

/**
 * Delete file from Google Drive (internal)
 */
async function deleteFileInternal(fileId: string): Promise<void> {
  if (!driveClient) {
    throw new Error('Google Drive client not initialized. Set GOOGLE_DRIVE_CREDENTIALS.');
  }

  logger.info({ fileId }, 'Deleting file from Google Drive');
  await driveClient.files.delete({ fileId });
  logger.info({ fileId }, 'File deleted from Google Drive');
}

/**
 * Delete file (protected)
 */
const deleteFileWithBreaker = createCircuitBreaker(deleteFileInternal, {
  timeout: 10000,
  name: 'google-drive-delete-file',
});

export const deleteFile = withRateLimit(
  (fileId: string) => deleteFileWithBreaker.fire(fileId),
  googleDriveRateLimiter
);

/**
 * Get file metadata (internal)
 */
async function getFileInternal(fileId: string): Promise<DriveFile> {
  if (!driveClient) {
    throw new Error('Google Drive client not initialized. Set GOOGLE_DRIVE_CREDENTIALS.');
  }

  logger.info({ fileId }, 'Fetching Google Drive file metadata');

  const response = await driveClient.files.get({
    fileId,
    fields: 'id,name,mimeType,createdTime,modifiedTime,size',
  });

  const file: DriveFile = {
    id: response.data.id!,
    name: response.data.name!,
    mimeType: response.data.mimeType!,
    createdTime: response.data.createdTime!,
    modifiedTime: response.data.modifiedTime!,
    size: response.data.size || undefined,
  };

  logger.info({ fileId, fileName: file.name }, 'File metadata fetched');
  return file;
}

/**
 * Get file metadata (protected)
 */
const getFileWithBreaker = createCircuitBreaker(getFileInternal, {
  timeout: 10000,
  name: 'google-drive-get-file',
});

export const getFile = withRateLimit(
  (fileId: string) => getFileWithBreaker.fire(fileId),
  googleDriveRateLimiter
);

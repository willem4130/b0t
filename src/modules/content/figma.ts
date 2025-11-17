import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Figma Module
 *
 * Read and manage Figma design files and assets
 * - Get file information
 * - List files
 * - Export frames and components
 * - Get design comments
 * - Built-in resilience
 *
 * Perfect for:
 * - Design automation
 * - Asset management
 * - Design handoff workflows
 * - Design system integration
 */

const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

if (!FIGMA_ACCESS_TOKEN) {
  logger.warn('⚠️  FIGMA_ACCESS_TOKEN not set. Figma features will not work.');
}

const FIGMA_API_BASE = 'https://api.figma.com/v1';

// Rate limiter: Figma allows 50 req/min per token
const figmaRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 1200, // 1200ms between requests ≈ 50/min
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60000,
  id: 'figma',
});

export interface FigmaFile {
  key: string;
  name: string;
  lastModified: string;
  version: string;
  documentVersion: string;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
}

export interface FigmaExportOption {
  format: 'jpg' | 'png' | 'svg' | 'pdf';
  scale?: number;
}

/**
 * Get file information (internal)
 */
async function getFileInternal(fileKey: string): Promise<FigmaFile> {
  if (!FIGMA_ACCESS_TOKEN) {
    throw new Error('Figma access token not set. Set FIGMA_ACCESS_TOKEN.');
  }

  logger.info({ fileKey }, 'Fetching Figma file');

  const response = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, {
    headers: {
      'X-Figma-Token': FIGMA_ACCESS_TOKEN,
    },
  });

  if (!response.ok) {
    throw new Error(`Figma API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { file: FigmaFile };

  logger.info({ fileName: data.file.name }, 'Figma file fetched');
  return data.file;
}

/**
 * Get file (protected)
 */
const getFileWithBreaker = createCircuitBreaker(getFileInternal, {
  timeout: 15000,
  name: 'figma-get-file',
});

export const getFile = withRateLimit(
  (fileKey: string) => getFileWithBreaker.fire(fileKey),
  figmaRateLimiter
);

/**
 * List files (internal)
 */
async function listFilesInternal(teamId: string): Promise<FigmaFile[]> {
  if (!FIGMA_ACCESS_TOKEN) {
    throw new Error('Figma access token not set. Set FIGMA_ACCESS_TOKEN.');
  }

  logger.info({ teamId }, 'Listing Figma files');

  const response = await fetch(`${FIGMA_API_BASE}/teams/${teamId}/files`, {
    headers: {
      'X-Figma-Token': FIGMA_ACCESS_TOKEN,
    },
  });

  if (!response.ok) {
    throw new Error(`Figma API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { files: FigmaFile[] };

  logger.info({ fileCount: data.files.length }, 'Figma files listed');
  return data.files;
}

/**
 * List files (protected)
 */
const listFilesWithBreaker = createCircuitBreaker(listFilesInternal, {
  timeout: 15000,
  name: 'figma-list-files',
});

export const listFiles = withRateLimit(
  (teamId: string) => listFilesWithBreaker.fire(teamId),
  figmaRateLimiter
);

/**
 * Export frame or node (internal)
 */
async function exportNodeInternal(
  fileKey: string,
  nodeIds: string[],
  options: FigmaExportOption = { format: 'png' }
): Promise<Record<string, string>> {
  if (!FIGMA_ACCESS_TOKEN) {
    throw new Error('Figma access token not set. Set FIGMA_ACCESS_TOKEN.');
  }

  logger.info(
    {
      fileKey,
      nodeCount: nodeIds.length,
      format: options.format,
    },
    'Exporting Figma nodes'
  );

  const params = new URLSearchParams({
    ids: nodeIds.join(','),
    format: options.format,
    scale: String(options.scale || 1),
  });

  const response = await fetch(`${FIGMA_API_BASE}/files/${fileKey}/export?${params}`, {
    headers: {
      'X-Figma-Token': FIGMA_ACCESS_TOKEN,
    },
  });

  if (!response.ok) {
    throw new Error(`Figma API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { images: Record<string, string> };

  logger.info({ exportCount: Object.keys(data.images).length }, 'Nodes exported');
  return data.images;
}

/**
 * Export node (protected)
 */
const exportNodeWithBreaker = createCircuitBreaker(exportNodeInternal, {
  timeout: 20000,
  name: 'figma-export-node',
});

export const exportNode = withRateLimit(
  (fileKey: string, nodeIds: string[], options?: FigmaExportOption) =>
    exportNodeWithBreaker.fire(fileKey, nodeIds, options),
  figmaRateLimiter
);

/**
 * Get comments on file (internal)
 */
async function getCommentsInternal(fileKey: string): Promise<Array<{ id: string; message: string }>> {
  if (!FIGMA_ACCESS_TOKEN) {
    throw new Error('Figma access token not set. Set FIGMA_ACCESS_TOKEN.');
  }

  logger.info({ fileKey }, 'Fetching Figma comments');

  const response = await fetch(`${FIGMA_API_BASE}/files/${fileKey}/comments`, {
    headers: {
      'X-Figma-Token': FIGMA_ACCESS_TOKEN,
    },
  });

  if (!response.ok) {
    throw new Error(`Figma API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { comments: Array<{ id: string; message: string }> };

  logger.info({ commentCount: data.comments.length }, 'Comments fetched');
  return data.comments;
}

/**
 * Get comments (protected)
 */
const getCommentsWithBreaker = createCircuitBreaker(getCommentsInternal, {
  timeout: 15000,
  name: 'figma-get-comments',
});

export const getComments = withRateLimit(
  (fileKey: string) => getCommentsWithBreaker.fire(fileKey),
  figmaRateLimiter
);

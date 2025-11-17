import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * Canva API Client with Reliability Infrastructure
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (100 requests/hour)
 * - Structured logging
 * - Automatic error handling
 * - Design creation and export automation
 *
 * API Documentation: https://www.canva.dev/docs/connect/
 */

// Canva rate limiter: 100 requests per hour
const canvaRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 36000, // 36 seconds between requests
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 60 * 1000, // Per hour
  id: 'canva-api',
});

// Canva circuit breaker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createCanvaCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
) {
  return createCircuitBreaker(fn, {
    timeout: 30000, // 30 seconds (design operations can be slow)
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `canva:${fn.name}`,
  });
}

export interface CanvaConfig {
  accessToken: string;
}

export interface CanvaDesign {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  thumbnail: {
    url: string;
  };
  urls: {
    edit_url: string;
    view_url: string;
  };
}

export interface CanvaBrandTemplate {
  id: string;
  name: string;
  thumbnail: {
    url: string;
  };
}

export interface CanvaExportJob {
  id: string;
  status: 'in_progress' | 'success' | 'failed';
  urls?: string[];
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Make authenticated request to Canva API
 */
async function canvaRequest(
  config: CanvaConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `https://api.canva.com/rest/v1${endpoint}`;

  logger.debug({ url, method: options.method || 'GET' }, 'Making Canva API request');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Canva API error');
    throw new Error(`Canva API error (${response.status}): ${error}`);
  }

  return response;
}

/**
 * Create design from template (internal, unprotected)
 */
async function createDesignFromTemplateInternal(
  config: CanvaConfig,
  templateId: string,
  title?: string
): Promise<CanvaDesign> {
  logger.info({ templateId, title }, 'Creating Canva design from template');

  const response = await canvaRequest(config, '/designs', {
    method: 'POST',
    body: JSON.stringify({
      design_type: 'template',
      asset_id: templateId,
      title,
    }),
  });

  const data = await response.json();
  const design = data.design;

  logger.info(
    { designId: design.id, title: design.title },
    'Canva design created successfully'
  );

  return design;
}

/**
 * Create design from template (protected with circuit breaker + rate limiting)
 */
const createDesignFromTemplateWithBreaker = createCanvaCircuitBreaker(
  createDesignFromTemplateInternal
);
export const createDesignFromTemplate = withRateLimit(
  (config: CanvaConfig, templateId: string, title?: string) =>
    createDesignFromTemplateWithBreaker.fire(config, templateId, title),
  canvaRateLimiter
);

/**
 * Get design by ID (internal, unprotected)
 */
async function getDesignInternal(
  config: CanvaConfig,
  designId: string
): Promise<CanvaDesign> {
  logger.info({ designId }, 'Fetching Canva design');

  const response = await canvaRequest(config, `/designs/${designId}`);
  const data = await response.json();

  logger.info({ designId, title: data.design.title }, 'Design fetched successfully');
  return data.design;
}

/**
 * Get design by ID (protected with circuit breaker + rate limiting)
 */
const getDesignWithBreaker = createCanvaCircuitBreaker(getDesignInternal);
export const getDesign = withRateLimit(
  (config: CanvaConfig, designId: string) =>
    getDesignWithBreaker.fire(config, designId),
  canvaRateLimiter
);

/**
 * List user's designs (internal, unprotected)
 */
async function listDesignsInternal(
  config: CanvaConfig,
  options?: {
    limit?: number;
    continuation?: string;
  }
): Promise<{ designs: CanvaDesign[]; continuation?: string }> {
  logger.info({ options }, 'Listing Canva designs');

  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.continuation) params.append('continuation', options.continuation);

  const queryString = params.toString();
  const endpoint = `/designs${queryString ? `?${queryString}` : ''}`;

  const response = await canvaRequest(config, endpoint);
  const data = await response.json();

  logger.info({ designsCount: data.designs.length }, 'Designs listed successfully');
  return {
    designs: data.designs,
    continuation: data.continuation,
  };
}

/**
 * List user's designs (protected with circuit breaker + rate limiting)
 */
const listDesignsWithBreaker = createCanvaCircuitBreaker(listDesignsInternal);
export const listDesigns = withRateLimit(
  (
    config: CanvaConfig,
    options?: {
      limit?: number;
      continuation?: string;
    }
  ) => listDesignsWithBreaker.fire(config, options),
  canvaRateLimiter
);

/**
 * Export design (internal, unprotected)
 */
async function exportDesignInternal(
  config: CanvaConfig,
  designId: string,
  format: 'jpg' | 'png' | 'pdf' | 'pptx' | 'gif' | 'mp4' = 'png',
  options?: {
    pages?: number[];
    quality?: 'low' | 'medium' | 'high';
  }
): Promise<CanvaExportJob> {
  logger.info({ designId, format, options }, 'Exporting Canva design');

  const response = await canvaRequest(config, `/designs/${designId}/export`, {
    method: 'POST',
    body: JSON.stringify({
      format,
      pages: options?.pages,
      quality: options?.quality,
    }),
  });

  const data = await response.json();
  const job = data.job;

  logger.info(
    { designId, jobId: job.id, status: job.status },
    'Export job created'
  );

  return job;
}

/**
 * Export design (protected with circuit breaker + rate limiting)
 */
const exportDesignWithBreaker = createCanvaCircuitBreaker(exportDesignInternal);
export const exportDesign = withRateLimit(
  (
    config: CanvaConfig,
    designId: string,
    format: 'jpg' | 'png' | 'pdf' | 'pptx' | 'gif' | 'mp4' = 'png',
    options?: {
      pages?: number[];
      quality?: 'low' | 'medium' | 'high';
    }
  ) => exportDesignWithBreaker.fire(config, designId, format, options),
  canvaRateLimiter
);

/**
 * Get export job status (internal, unprotected)
 */
async function getExportJobInternal(
  config: CanvaConfig,
  jobId: string
): Promise<CanvaExportJob> {
  logger.info({ jobId }, 'Checking Canva export job status');

  const response = await canvaRequest(config, `/export-jobs/${jobId}`);
  const data = await response.json();

  logger.info({ jobId, status: data.job.status }, 'Export job status fetched');
  return data.job;
}

/**
 * Get export job status (protected with circuit breaker + rate limiting)
 */
const getExportJobWithBreaker = createCanvaCircuitBreaker(getExportJobInternal);
export const getExportJob = withRateLimit(
  (config: CanvaConfig, jobId: string) =>
    getExportJobWithBreaker.fire(config, jobId),
  canvaRateLimiter
);

/**
 * Wait for export to complete and return URLs (internal, unprotected)
 */
async function waitForExportInternal(
  config: CanvaConfig,
  jobId: string,
  maxAttempts = 20,
  pollInterval = 3000
): Promise<string[]> {
  logger.info(
    { jobId, maxAttempts, pollInterval },
    'Waiting for Canva export to complete'
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await getExportJobInternal(config, jobId);

    if (job.status === 'success' && job.urls) {
      logger.info({ jobId, urls: job.urls }, 'Export completed successfully');
      return job.urls;
    }

    if (job.status === 'failed') {
      logger.error(
        { jobId, error: job.error },
        'Export failed'
      );
      throw new Error(`Export failed: ${job.error?.message || 'Unknown error'}`);
    }

    logger.debug(
      { jobId, attempt, status: job.status },
      'Export still in progress'
    );

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Export timed out after ${maxAttempts} attempts`);
}

/**
 * Wait for export to complete and return URLs (protected with circuit breaker + rate limiting)
 */
const waitForExportWithBreaker = createCanvaCircuitBreaker(waitForExportInternal);
export const waitForExport = withRateLimit(
  (config: CanvaConfig, jobId: string, maxAttempts = 20, pollInterval = 3000) =>
    waitForExportWithBreaker.fire(config, jobId, maxAttempts, pollInterval),
  canvaRateLimiter
);

/**
 * Get brand templates (internal, unprotected)
 */
async function getBrandTemplatesInternal(
  config: CanvaConfig,
  options?: {
    limit?: number;
    continuation?: string;
  }
): Promise<{ templates: CanvaBrandTemplate[]; continuation?: string }> {
  logger.info({ options }, 'Fetching Canva brand templates');

  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.continuation) params.append('continuation', options.continuation);

  const queryString = params.toString();
  const endpoint = `/brand-templates${queryString ? `?${queryString}` : ''}`;

  const response = await canvaRequest(config, endpoint);
  const data = await response.json();

  logger.info(
    { templatesCount: data.items?.length || 0 },
    'Brand templates fetched'
  );

  return {
    templates: data.items || [],
    continuation: data.continuation,
  };
}

/**
 * Get brand templates (protected with circuit breaker + rate limiting)
 */
const getBrandTemplatesWithBreaker = createCanvaCircuitBreaker(
  getBrandTemplatesInternal
);
export const getBrandTemplates = withRateLimit(
  (
    config: CanvaConfig,
    options?: {
      limit?: number;
      continuation?: string;
    }
  ) => getBrandTemplatesWithBreaker.fire(config, options),
  canvaRateLimiter
);

/**
 * Create and export design in one operation (internal, unprotected)
 */
async function createAndExportDesignInternal(
  config: CanvaConfig,
  templateId: string,
  format: 'jpg' | 'png' | 'pdf' | 'pptx' | 'gif' | 'mp4' = 'png',
  title?: string,
  exportOptions?: {
    pages?: number[];
    quality?: 'low' | 'medium' | 'high';
  }
): Promise<{ design: CanvaDesign; urls: string[] }> {
  logger.info(
    { templateId, format, title },
    'Creating and exporting Canva design'
  );

  // Create design from template
  const design = await createDesignFromTemplateInternal(config, templateId, title);

  // Export the design
  const exportJob = await exportDesignInternal(
    config,
    design.id,
    format,
    exportOptions
  );

  // Wait for export to complete
  const urls = await waitForExportInternal(config, exportJob.id);

  logger.info(
    { designId: design.id, urls },
    'Design created and exported successfully'
  );

  return { design, urls };
}

/**
 * Create and export design in one operation (protected with circuit breaker + rate limiting)
 */
const createAndExportDesignWithBreaker = createCanvaCircuitBreaker(
  createAndExportDesignInternal
);
export const createAndExportDesign = withRateLimit(
  (
    config: CanvaConfig,
    templateId: string,
    format: 'jpg' | 'png' | 'pdf' | 'pptx' | 'gif' | 'mp4' = 'png',
    title?: string,
    exportOptions?: {
      pages?: number[];
      quality?: 'low' | 'medium' | 'high';
    }
  ) => createAndExportDesignWithBreaker.fire(config, templateId, format, title, exportOptions),
  canvaRateLimiter
);

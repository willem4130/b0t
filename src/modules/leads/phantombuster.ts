/* eslint-disable */
// @ts-nocheck - External library type mismatches, to be fixed in future iteration
import axios from 'axios';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

/**
 * PhantomBuster Automation Module
 *
 * Automate web scraping and lead generation tasks
 * Built with production-grade reliability:
 * - Circuit breaker to prevent hammering failing APIs
 * - Rate limiting (120 req/min for PhantomBuster API limits)
 * - Structured logging
 * - Automatic error handling
 *
 * Perfect for:
 * - Running automated scrapers (Phantoms)
 * - LinkedIn, Twitter, Instagram automation
 * - Email extraction from websites
 * - Lead list building
 */

// PhantomBuster API rate limiter (120 req/min)
const phantombusterRateLimiter = createRateLimiter({
  maxConcurrent: 10,
  minTime: 500, // 500ms between requests = ~120/min
  reservoir: 120,
  reservoirRefreshAmount: 120,
  reservoirRefreshInterval: 60 * 1000,
  id: 'phantombuster-api',
});

const PHANTOMBUSTER_API_BASE = 'https://api.phantombuster.com/api/v2';

interface PhantomBusterConfig {
  apiKey: string;
}

function getApiKey(config?: PhantomBusterConfig): string {
  const apiKey = config?.apiKey || process.env.PHANTOMBUSTER_API_KEY;
  if (!apiKey) {
    throw new Error('PhantomBuster API key is required. Set PHANTOMBUSTER_API_KEY env var or pass apiKey in config.');
  }
  return apiKey;
}

/**
 * Launch a Phantom (automated scraper)
 */
async function launchPhantomInternal(params: {
  phantomId: string;
  argument?: Record<string, unknown>;
  bonusArgument?: Record<string, unknown>;
  apiKey?: string;
}): Promise<{
  containerId: string;
  status: string;
  launchedAt: string;
}> {
  const { phantomId, argument, bonusArgument } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ phantomId }, 'Launching Phantom with PhantomBuster');

  try {
    const response = await axios.post(
      `${PHANTOMBUSTER_API_BASE}/phantoms/launch`,
      {
        id: phantomId,
        argument,
        bonusArgument,
      },
      {
        headers: {
          'X-Phantombuster-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;

    logger.info({ phantomId, containerId: data.containerId }, 'Phantom launched successfully');

    return {
      containerId: data.containerId,
      status: data.status,
      launchedAt: data.launchedAt,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'PhantomBuster launch failed');
      throw new Error(`PhantomBuster launch failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const launchPhantomWithBreaker = createCircuitBreaker(launchPhantomInternal, {
  timeout: 15000,
  name: 'phantombuster-launch',
});

export const launchPhantom = withRateLimit(
  (params: Parameters<typeof launchPhantomInternal>[0]) => launchPhantomWithBreaker.fire(params),
  phantombusterRateLimiter
);

/**
 * Get Phantom execution status
 */
async function getPhantomStatusInternal(params: {
  containerId: string;
  apiKey?: string;
}): Promise<{
  status: 'running' | 'finished' | 'error' | 'interrupted';
  progress: number;
  message: string;
  launchedAt: string;
  finishedAt: string | null;
  executionTime: number;
}> {
  const { containerId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ containerId }, 'Getting Phantom status with PhantomBuster');

  try {
    const response = await axios.get(`${PHANTOMBUSTER_API_BASE}/containers/fetch`, {
      params: {
        id: containerId,
      },
      headers: {
        'X-Phantombuster-Key': apiKey,
      },
    });

    const container = response.data;

    logger.info({ containerId, status: container.status }, 'Phantom status retrieved');

    return {
      status: container.status,
      progress: container.progress,
      message: container.message,
      launchedAt: container.launchedAt,
      finishedAt: container.finishedAt,
      executionTime: container.executionTime,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'PhantomBuster status check failed');
      throw new Error(`PhantomBuster status check failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getPhantomStatusWithBreaker = createCircuitBreaker(getPhantomStatusInternal, {
  timeout: 10000,
  name: 'phantombuster-status',
});

export const getPhantomStatus = withRateLimit(
  (params: Parameters<typeof getPhantomStatusInternal>[0]) => getPhantomStatusWithBreaker.fire(params),
  phantombusterRateLimiter
);

/**
 * Get Phantom output/results
 */
async function getPhantomOutputInternal(params: {
  containerId: string;
  apiKey?: string;
}): Promise<{
  containerId: string;
  output: string;
  resultObject: Record<string, unknown> | null;
  outputUrl: string;
}> {
  const { containerId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ containerId }, 'Getting Phantom output with PhantomBuster');

  try {
    const response = await axios.get(`${PHANTOMBUSTER_API_BASE}/containers/fetch-output`, {
      params: {
        id: containerId,
      },
      headers: {
        'X-Phantombuster-Key': apiKey,
      },
    });

    const data = response.data;

    logger.info({ containerId, hasOutput: !!data.output }, 'Phantom output retrieved');

    return {
      containerId,
      output: data.output,
      resultObject: data.resultObject,
      outputUrl: data.outputUrl,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'PhantomBuster output fetch failed');
      throw new Error(`PhantomBuster output fetch failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getPhantomOutputWithBreaker = createCircuitBreaker(getPhantomOutputInternal, {
  timeout: 15000,
  name: 'phantombuster-output',
});

export const getPhantomOutput = withRateLimit(
  (params: Parameters<typeof getPhantomOutputInternal>[0]) => getPhantomOutputWithBreaker.fire(params),
  phantombusterRateLimiter
);

/**
 * List all available Phantoms
 */
async function listPhantomsInternal(params: {
  apiKey?: string;
}): Promise<Array<{
  id: string;
  name: string;
  script: string;
  launchType: string;
  executionTimeLimit: number;
  lastEndStatus: string;
}>> {
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info('Listing all Phantoms with PhantomBuster');

  try {
    const response = await axios.get(`${PHANTOMBUSTER_API_BASE}/phantoms/fetch-all`, {
      headers: {
        'X-Phantombuster-Key': apiKey,
      },
    });

    const phantoms = response.data;

    logger.info({ phantomCount: phantoms.length }, 'Phantoms listed successfully');

    return phantoms.map((phantom: Record<string, unknown>) => ({
      id: phantom.id,
      name: phantom.name,
      script: phantom.script,
      launchType: phantom.launchType,
      executionTimeLimit: phantom.executionTimeLimit,
      lastEndStatus: phantom.lastEndStatus,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'PhantomBuster list failed');
      throw new Error(`PhantomBuster list failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const listPhantomsWithBreaker = createCircuitBreaker(listPhantomsInternal, {
  timeout: 10000,
  name: 'phantombuster-list',
});

export const listPhantoms = withRateLimit(
  (params: Parameters<typeof listPhantomsInternal>[0]) => listPhantomsWithBreaker.fire(params),
  phantombusterRateLimiter
);

/**
 * Stop a running Phantom
 */
async function stopPhantomInternal(params: {
  containerId: string;
  apiKey?: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const { containerId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ containerId }, 'Stopping Phantom with PhantomBuster');

  try {
    const response = await axios.post(
      `${PHANTOMBUSTER_API_BASE}/containers/abort`,
      {
        id: containerId,
      },
      {
        headers: {
          'X-Phantombuster-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info({ containerId }, 'Phantom stopped successfully');

    return {
      success: true,
      message: response.data.message || 'Phantom stopped',
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'PhantomBuster stop failed');
      throw new Error(`PhantomBuster stop failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const stopPhantomWithBreaker = createCircuitBreaker(stopPhantomInternal, {
  timeout: 10000,
  name: 'phantombuster-stop',
});

export const stopPhantom = withRateLimit(
  (params: Parameters<typeof stopPhantomInternal>[0]) => stopPhantomWithBreaker.fire(params),
  phantombusterRateLimiter
);

/**
 * Get Agent (pre-built Phantom) details
 */
async function getAgentInternal(params: {
  agentId: string;
  apiKey?: string;
}): Promise<{
  id: string;
  name: string;
  script: string;
  launchType: string;
  lastEndStatus: string;
  manifest: {
    description: string;
    argument: Record<string, unknown>;
  };
}> {
  const { agentId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ agentId }, 'Getting Agent details with PhantomBuster');

  try {
    const response = await axios.get(`${PHANTOMBUSTER_API_BASE}/agents/fetch`, {
      params: {
        id: agentId,
      },
      headers: {
        'X-Phantombuster-Key': apiKey,
      },
    });

    const agent = response.data;

    logger.info({ agentId, name: agent.name }, 'Agent details retrieved');

    return {
      id: agent.id,
      name: agent.name,
      script: agent.script,
      launchType: agent.launchType,
      lastEndStatus: agent.lastEndStatus,
      manifest: agent.manifest,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'PhantomBuster agent fetch failed');
      throw new Error(`PhantomBuster agent fetch failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getAgentWithBreaker = createCircuitBreaker(getAgentInternal, {
  timeout: 10000,
  name: 'phantombuster-get-agent',
});

export const getAgent = withRateLimit(
  (params: Parameters<typeof getAgentInternal>[0]) => getAgentWithBreaker.fire(params),
  phantombusterRateLimiter
);

/**
 * Launch a Phantom and wait for completion
 */
async function launchAndWaitInternal(params: {
  phantomId: string;
  argument?: Record<string, unknown>;
  bonusArgument?: Record<string, unknown>;
  maxWaitTime?: number;
  pollInterval?: number;
  apiKey?: string;
}): Promise<{
  status: 'finished' | 'error' | 'timeout';
  containerId: string;
  output: string | null;
  resultObject: Record<string, unknown> | null;
  executionTime: number;
}> {
  const { phantomId, argument, bonusArgument, maxWaitTime = 300000, pollInterval = 5000 } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ phantomId, maxWaitTime }, 'Launching Phantom and waiting for completion');

  // Launch the phantom
  const launch = await launchPhantomInternal({ phantomId, argument, bonusArgument, apiKey });
  const { containerId } = launch;

  const startTime = Date.now();
  let status: 'running' | 'finished' | 'error' | 'interrupted' = 'running';
  let executionTime = 0;

  // Poll for completion
  while (status === 'running') {
    // Check timeout
    if (Date.now() - startTime > maxWaitTime) {
      logger.warn({ containerId, maxWaitTime }, 'Phantom execution timeout');
      return {
        status: 'timeout',
        containerId,
        output: null,
        resultObject: null,
        executionTime: Date.now() - startTime,
      };
    }

    // Wait before polling
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    // Check status
    const statusData = await getPhantomStatusInternal({ containerId, apiKey });
    status = statusData.status;
    executionTime = statusData.executionTime;

    logger.info({ containerId, status, progress: statusData.progress }, 'Phantom status checked');
  }

  // Get output if finished successfully
  let output = null;
  let resultObject = null;

  if (status === 'finished') {
    const outputData = await getPhantomOutputInternal({ containerId, apiKey });
    output = outputData.output;
    resultObject = outputData.resultObject;
  }

  logger.info({ containerId, status, executionTime }, 'Phantom execution completed');

  return {
    status,
    containerId,
    output,
    resultObject,
    executionTime,
  };
}

const launchAndWaitWithBreaker = createCircuitBreaker(launchAndWaitInternal, {
  timeout: 600000, // 10 minutes max
  name: 'phantombuster-launch-and-wait',
});

export const launchAndWait = withRateLimit(
  (params: Parameters<typeof launchAndWaitInternal>[0]) => launchAndWaitWithBreaker.fire(params),
  phantombusterRateLimiter
);

/**
 * Get Agent output CSV data
 */
async function getAgentCsvOutputInternal(params: {
  agentId: string;
  apiKey?: string;
}): Promise<{
  csvUrl: string;
  data: Array<Record<string, unknown>>;
}> {
  const { agentId } = params;
  const apiKey = getApiKey({ apiKey: params.apiKey });

  logger.info({ agentId }, 'Getting Agent CSV output with PhantomBuster');

  try {
    const response = await axios.get(`${PHANTOMBUSTER_API_BASE}/agents/fetch-output`, {
      params: {
        id: agentId,
        mode: 'most-recent',
      },
      headers: {
        'X-Phantombuster-Key': apiKey,
      },
    });

    const data = response.data;

    logger.info({ agentId, rowCount: data.resultObject?.length || 0 }, 'Agent CSV output retrieved');

    return {
      csvUrl: data.resultObjectUrl,
      data: data.resultObject || [],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error({ status: error.response?.status, message: error.message }, 'PhantomBuster CSV output failed');
      throw new Error(`PhantomBuster CSV output failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

const getAgentCsvOutputWithBreaker = createCircuitBreaker(getAgentCsvOutputInternal, {
  timeout: 15000,
  name: 'phantombuster-csv-output',
});

export const getAgentCsvOutput = withRateLimit(
  (params: Parameters<typeof getAgentCsvOutputInternal>[0]) => getAgentCsvOutputWithBreaker.fire(params),
  phantombusterRateLimiter
);

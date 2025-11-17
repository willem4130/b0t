/**
 * MCP Manager Module
 *
 * High-level functions for managing MCP servers in workflows.
 * Provides simple interfaces for connecting to MCP servers and using their tools.
 */

import { connectToMCPServer, disconnectFromMCPServer, disconnectAllMCPServers, getMCPClient, getAllMCPClients } from '@/lib/mcp/client';
import { MCP_SERVER_CONFIGS, getMCPServerConfig } from '@/lib/mcp/server-configs';
import { logger } from '@/lib/logger';

/**
 * Connect to multiple MCP servers
 */
export async function connectToMCPServers(params: {
  servers: string[];
  credentials?: Record<string, string>;
}): Promise<{
  success: boolean;
  connected: string[];
  failed: Array<{ name: string; error: string }>;
}> {
  const { servers, credentials = {} } = params;

  const connected: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  logger.info({ servers }, 'Connecting to MCP servers');

  for (const serverName of servers) {
    try {
      const config = getMCPServerConfig(serverName);

      if (!config) {
        failed.push({
          name: serverName,
          error: `Server configuration not found`,
        });
        continue;
      }

      // Inject credentials into environment variables
      const env = { ...config.env };
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          // Replace {{credential.X}} with actual credential
          if (typeof value === 'string' && value.includes('{{credential.')) {
            const credentialKey = value.match(/\{\{credential\.(.+?)\}\}/)?.[1];
            if (credentialKey && credentials[credentialKey]) {
              env[key] = credentials[credentialKey];
            }
          }
        }
      }

      await connectToMCPServer({
        ...config,
        env,
      });

      connected.push(serverName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failed.push({
        name: serverName,
        error: errorMessage,
      });
    }
  }

  logger.info(
    { connected: connected.length, failed: failed.length },
    'MCP server connections completed'
  );

  return {
    success: connected.length > 0,
    connected,
    failed,
  };
}

/**
 * Disconnect from MCP servers
 */
export async function disconnectMCPServers(params: {
  servers?: string[];
}): Promise<{
  success: boolean;
  disconnected: string[];
}> {
  const { servers } = params;

  if (!servers || servers.length === 0) {
    // Disconnect from all servers
    await disconnectAllMCPServers();
    return {
      success: true,
      disconnected: [],
    };
  }

  const disconnected: string[] = [];

  for (const serverName of servers) {
    try {
      await disconnectFromMCPServer(serverName);
      disconnected.push(serverName);
    } catch (error) {
      logger.error({ serverName, error }, 'Error disconnecting from MCP server');
    }
  }

  return {
    success: disconnected.length > 0,
    disconnected,
  };
}

/**
 * List all configured MCP servers
 */
export function listMCPServers(): {
  servers: Array<{
    name: string;
    description: string;
    category: string;
    requiresCredentials: string[];
    connected: boolean;
  }>;
} {
  const activeClients = getAllMCPClients();
  const activeNames = new Set(activeClients.map((c) => c.name));

  const servers = Object.values(MCP_SERVER_CONFIGS).map((config) => ({
    name: config.name,
    description: config.description || '',
    category: config.category || 'other',
    requiresCredentials: config.requiresCredentials || [],
    connected: activeNames.has(config.name),
  }));

  return { servers };
}

/**
 * Get status of connected MCP servers
 */
export function getMCPServersStatus(): {
  connectedCount: number;
  servers: Array<{
    name: string;
    toolCount: number;
  }>;
} {
  const activeClients = getAllMCPClients();

  return {
    connectedCount: activeClients.length,
    servers: activeClients.map((client) => ({
      name: client.name,
      toolCount: client.tools.size,
    })),
  };
}

/**
 * Check if an MCP server is connected
 */
export function isMCPServerConnected(params: { server: string }): boolean {
  const { server } = params;
  return getMCPClient(server) !== undefined;
}

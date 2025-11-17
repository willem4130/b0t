/**
 * MCP Client Infrastructure
 *
 * Manages connections to Model Context Protocol servers and converts
 * their tools into AI SDK-compatible format for use with AI agents.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from 'ai';
import { z } from 'zod';
import { logger } from '@/lib/logger';

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  category?: string;
  requiresCredentials?: string[];
}

export interface MCPClientInstance {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  tools: Map<string, unknown>;
}

/**
 * Active MCP client connections
 */
const activeClients = new Map<string, MCPClientInstance>();

/**
 * Connect to an MCP server and initialize the client
 */
export async function connectToMCPServer(
  config: MCPServerConfig
): Promise<MCPClientInstance> {
  const { name, command, args = [], env = {} } = config;

  try {
    logger.info({ name, command, args }, 'Connecting to MCP server');

    // Create transport
    const transport = new StdioClientTransport({
      command,
      args,
      env: {
        ...(process.env as Record<string, string>),
        ...env,
      },
    });

    // Create client
    const client = new Client(
      {
        name: `b0t-mcp-client-${name}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Connect
    await client.connect(transport);

    // List available tools
    const toolsList = await client.listTools();

    logger.info(
      {
        name,
        toolCount: toolsList.tools.length,
        tools: toolsList.tools.map((t) => t.name),
      },
      'MCP server connected successfully'
    );

    const instance: MCPClientInstance = {
      name,
      client,
      transport,
      tools: new Map(toolsList.tools.map((tool) => [tool.name, tool])),
    };

    activeClients.set(name, instance);

    return instance;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ name, error: errorMessage }, 'Failed to connect to MCP server');
    throw new Error(`Failed to connect to MCP server ${name}: ${errorMessage}`);
  }
}

/**
 * Disconnect from an MCP server
 */
export async function disconnectFromMCPServer(name: string): Promise<void> {
  const instance = activeClients.get(name);
  if (!instance) {
    logger.warn({ name }, 'MCP server not found in active connections');
    return;
  }

  try {
    await instance.client.close();
    activeClients.delete(name);
    logger.info({ name }, 'Disconnected from MCP server');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ name, error: errorMessage }, 'Error disconnecting from MCP server');
  }
}

/**
 * Disconnect from all MCP servers
 */
export async function disconnectAllMCPServers(): Promise<void> {
  const serverNames = Array.from(activeClients.keys());

  logger.info({ serverCount: serverNames.length }, 'Disconnecting from all MCP servers');

  await Promise.all(serverNames.map((name) => disconnectFromMCPServer(name)));
}

/**
 * Convert MCP tool to AI SDK Tool format
 */
function mcpToolToAISDKTool(mcpTool: {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}): Tool {
  // Build Zod schema from JSON Schema
  const properties = mcpTool.inputSchema.properties || {};
  const required = mcpTool.inputSchema.required || [];

  const schemaFields: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(properties)) {
    const prop = value as {
      type?: string;
      description?: string;
      enum?: string[];
    };

    let fieldSchema: z.ZodTypeAny;

    // Convert JSON Schema type to Zod
    if (prop.enum) {
      fieldSchema = z.enum(prop.enum as [string, ...string[]]);
    } else {
      switch (prop.type) {
        case 'string':
          fieldSchema = z.string();
          break;
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          fieldSchema = z.array(z.unknown());
          break;
        case 'object':
          fieldSchema = z.record(z.string(), z.unknown());
          break;
        default:
          fieldSchema = z.unknown();
      }
    }

    // Add description
    if (prop.description) {
      fieldSchema = fieldSchema.describe(prop.description);
    }

    // Make optional if not required
    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional();
    }

    schemaFields[key] = fieldSchema;
  }

  const zodSchema = z.object(schemaFields);

  return {
    description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
    inputSchema: zodSchema,
    execute: async (params: Record<string, unknown>) => {
      // This will be overridden when creating agent tools
      return params;
    },
  };
}

/**
 * Get MCP client by name
 */
export function getMCPClient(name: string): MCPClientInstance | undefined {
  return activeClients.get(name);
}

/**
 * Get all active MCP clients
 */
export function getAllMCPClients(): MCPClientInstance[] {
  return Array.from(activeClients.values());
}

/**
 * Convert all tools from an MCP server to AI SDK format
 */
export function getMCPServerTools(serverName: string): Record<string, Tool> {
  const instance = activeClients.get(serverName);
  if (!instance) {
    logger.warn({ serverName }, 'MCP server not found');
    return {};
  }

  const tools: Record<string, Tool> = {};

  for (const [toolName, mcpTool] of instance.tools.entries()) {
    const tool = mcpTool as {
      name: string;
      description?: string;
      inputSchema: {
        type: 'object';
        properties?: Record<string, unknown>;
        required?: string[];
      };
    };

    // Prefix tool name with server name to avoid conflicts
    const prefixedName = `mcp_${serverName}_${toolName}`;

    tools[prefixedName] = {
      ...mcpToolToAISDKTool(tool),
      execute: async (params: Record<string, unknown>) => {
        try {
          logger.info({ serverName, toolName, params }, 'Executing MCP tool');

          const result = await instance.client.callTool({
            name: toolName,
            arguments: params,
          });

          logger.info({ serverName, toolName }, 'MCP tool executed successfully');

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(
            { serverName, toolName, error: errorMessage },
            'MCP tool execution failed'
          );

          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    };
  }

  return tools;
}

/**
 * Get tools from multiple MCP servers
 */
export function getMCPTools(serverNames: string[]): Record<string, Tool> {
  const allTools: Record<string, Tool> = {};

  for (const serverName of serverNames) {
    const serverTools = getMCPServerTools(serverName);
    Object.assign(allTools, serverTools);
  }

  return allTools;
}

/**
 * Get all tools from all connected MCP servers
 */
export function getAllMCPTools(): Record<string, Tool> {
  const serverNames = Array.from(activeClients.keys());
  return getMCPTools(serverNames);
}

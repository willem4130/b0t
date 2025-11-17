/**
 * MCP Server Configurations
 *
 * Defines the available MCP servers that can be used with AI agents.
 * Each server configuration includes installation instructions, required credentials,
 * and the command to start the server.
 */

import type { MCPServerConfig } from './client';

/**
 * All available MCP server configurations
 */
export const MCP_SERVER_CONFIGS: Record<string, MCPServerConfig> = {
  // ============================================================================
  // WEB & SEARCH
  // ============================================================================

  'tavily-search': {
    name: 'tavily-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-tavily'],
    description: 'AI-optimized search engine for factual information with citation support',
    category: 'web',
    requiresCredentials: ['tavily_api_key'],
    env: {
      TAVILY_API_KEY: '{{credential.tavily_api_key}}',
    },
  },

  'brave-search': {
    name: 'brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    description: 'Privacy-focused web search with advanced operators',
    category: 'web',
    requiresCredentials: ['brave_api_key'],
    env: {
      BRAVE_API_KEY: '{{credential.brave_api_key}}',
    },
  },


  // ============================================================================
  // FILE & CODE OPERATIONS
  // ============================================================================

  filesystem: {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    description: 'Secure file operations with access control',
    category: 'filesystem',
    requiresCredentials: [],
  },

  puppeteer: {
    name: 'puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    description: 'Browser automation and web scraping',
    category: 'web',
    requiresCredentials: [],
  },

  // ============================================================================
  // DATA & DATABASE
  // ============================================================================

  postgres: {
    name: 'postgres',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    description: 'PostgreSQL database operations',
    category: 'data',
    requiresCredentials: ['postgres_connection_string'],
    env: {
      DATABASE_URL: '{{credential.postgres_connection_string}}',
    },
  },

  memory: {
    name: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    description: 'Knowledge graph-based persistent memory',
    category: 'utilities',
    requiresCredentials: [],
  },

  // ============================================================================
  // PRODUCTIVITY & COLLABORATION
  // ============================================================================

  github: {
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    description: 'GitHub repository management and operations',
    category: 'devtools',
    requiresCredentials: ['github_token'],
    env: {
      GITHUB_TOKEN: '{{credential.github_token}}',
    },
  },

  slack: {
    name: 'slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    description: 'Team communication and messaging',
    category: 'communication',
    requiresCredentials: ['slack_bot_token', 'slack_team_id'],
    env: {
      SLACK_BOT_TOKEN: '{{credential.slack_bot_token}}',
      SLACK_TEAM_ID: '{{credential.slack_team_id}}',
    },
  },

  'google-drive': {
    name: 'google-drive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    description: 'File storage and management in Google Drive',
    category: 'productivity',
    requiresCredentials: ['google_oauth_token'],
    env: {
      GOOGLE_OAUTH_TOKEN: '{{credential.google_oauth_token}}',
    },
  },

  // ============================================================================
  // UTILITY
  // ============================================================================
};

/**
 * Get MCP servers by category
 */
export function getMCPServersByCategory(category: string): MCPServerConfig[] {
  return Object.values(MCP_SERVER_CONFIGS).filter(
    (config) => config.category === category
  );
}

/**
 * Get MCP servers that don't require credentials
 */
export function getCredentialFreeMCPServers(): MCPServerConfig[] {
  return Object.values(MCP_SERVER_CONFIGS).filter(
    (config) => !config.requiresCredentials || config.requiresCredentials.length === 0
  );
}

/**
 * Get all MCP server names
 */
export function getAllMCPServerNames(): string[] {
  return Object.keys(MCP_SERVER_CONFIGS);
}

/**
 * Get MCP server config by name
 */
export function getMCPServerConfig(name: string): MCPServerConfig | undefined {
  return MCP_SERVER_CONFIGS[name];
}

/**
 * MCP server categories
 */
export const MCP_CATEGORIES = {
  web: 'Web & Search',
  filesystem: 'File Operations',
  devtools: 'Development Tools',
  data: 'Data & Database',
  utilities: 'Utilities',
  productivity: 'Productivity',
  communication: 'Communication',
} as const;

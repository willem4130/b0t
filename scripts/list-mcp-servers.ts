#!/usr/bin/env tsx
/**
 * List MCP Servers Script
 *
 * Displays all available MCP servers that can be used with AI agents.
 * Shows server names, descriptions, categories, and required credentials.
 *
 * Usage:
 *   npx tsx scripts/list-mcp-servers.ts
 *   npx tsx scripts/list-mcp-servers.ts --category web
 *   npx tsx scripts/list-mcp-servers.ts --format json
 *   npx tsx scripts/list-mcp-servers.ts --no-credentials (show only servers without credentials)
 */

import {
  MCP_SERVER_CONFIGS,
  getMCPServersByCategory,
  getCredentialFreeMCPServers,
  MCP_CATEGORIES,
} from '../src/lib/mcp/server-configs';

const args = process.argv.slice(2);
const categoryFlag = args.indexOf('--category');
const formatFlag = args.indexOf('--format');
const noCredentialsFlag = args.includes('--no-credentials');

const filterCategory = categoryFlag !== -1 ? args[categoryFlag + 1] : null;
const outputFormat = formatFlag !== -1 ? args[formatFlag + 1] : 'text';

interface ServerInfo {
  name: string;
  category: string;
  description: string;
  requiresCredentials: string[];
  credentialCount: number;
}

// Get servers based on filters
let servers = Object.values(MCP_SERVER_CONFIGS);

if (filterCategory) {
  servers = getMCPServersByCategory(filterCategory);
}

if (noCredentialsFlag) {
  servers = getCredentialFreeMCPServers();
}

// Extract server information
const serverInfos: ServerInfo[] = servers.map((server) => ({
  name: server.name,
  category: server.category || 'other',
  description: server.description || 'No description',
  requiresCredentials: server.requiresCredentials || [],
  credentialCount: (server.requiresCredentials || []).length,
}));

// Output
if (outputFormat === 'json') {
  console.log(JSON.stringify(serverInfos, null, 2));
} else {
  // Group by category
  const byCategory: Record<string, ServerInfo[]> = {};
  for (const serverInfo of serverInfos) {
    if (!byCategory[serverInfo.category]) {
      byCategory[serverInfo.category] = [];
    }
    byCategory[serverInfo.category].push(serverInfo);
  }

  console.log('🤖 MCP Servers for AI Agents\n');
  console.log(`Total servers: ${serverInfos.length}\n`);

  for (const [category, categoryServers] of Object.entries(byCategory)) {
    const categoryName = MCP_CATEGORIES[category as keyof typeof MCP_CATEGORIES] || category;
    console.log(`\n📁 ${categoryName.toUpperCase()} (${categoryServers.length} servers)`);
    console.log('─'.repeat(60));

    for (const server of categoryServers) {
      console.log(`\n  ${server.name}`);
      console.log(`  ${server.description}`);
      if (server.credentialCount > 0) {
        console.log(
          `  🔐 Requires: ${server.requiresCredentials.join(', ')}`
        );
      } else {
        console.log('  ✅ No credentials required');
      }
    }
  }

  console.log('\n\n💡 Usage:');
  console.log('  --category <name>      Filter by category (web, filesystem, devtools, data, utilities, productivity, communication)');
  console.log('  --format json          Output as JSON');
  console.log('  --no-credentials       Show only servers that don\'t require credentials');
  console.log('\nExamples:');
  console.log('  npx tsx scripts/list-mcp-servers.ts --category web');
  console.log('  npx tsx scripts/list-mcp-servers.ts --no-credentials');
  console.log('  npx tsx scripts/list-mcp-servers.ts --format json');

  console.log('\n📚 Categories:');
  for (const [key, value] of Object.entries(MCP_CATEGORIES)) {
    const count = byCategory[key]?.length || 0;
    console.log(`  ${key.padEnd(15)} - ${value} (${count} servers)`);
  }
}

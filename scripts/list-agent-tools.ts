#!/usr/bin/env tsx
/**
 * List Agent Tools Script
 *
 * Displays all available tools for AI agents, organized by category.
 * Shows tool names, descriptions, and parameters.
 *
 * Usage:
 *   npx tsx scripts/list-agent-tools.ts
 *   npx tsx scripts/list-agent-tools.ts --category web
 *   npx tsx scripts/list-agent-tools.ts --format json
 */

import { agentToolsLibrary, getAgentToolsByCategory } from '../src/modules/ai/agent-tools-library';

const args = process.argv.slice(2);
const categoryFlag = args.indexOf('--category');
const formatFlag = args.indexOf('--format');
const filterCategory = categoryFlag !== -1 ? args[categoryFlag + 1] : null;
const outputFormat = formatFlag !== -1 ? args[formatFlag + 1] : 'text';

// Category mapping (same as in agent-tools-library.ts)
const categoryMap: Record<string, string[]> = {
  web: ['fetchWebPage'],
  ai: ['generateText'],
  communication: [],
  utilities: ['getCurrentDateTime', 'calculate'],
};

interface ToolInfo {
  name: string;
  category: string;
  description: string;
  parameters: string[];
}

function getToolCategory(toolName: string): string {
  for (const [category, tools] of Object.entries(categoryMap)) {
    if (tools.includes(toolName)) {
      return category;
    }
  }
  return 'other';
}

function extractParameters(tool: unknown): string[] {
  if (!tool || typeof tool !== 'object') {
    return [];
  }

  // Try to access inputSchema
  const inputSchema = (tool as { inputSchema?: unknown }).inputSchema;
  if (!inputSchema || typeof inputSchema !== 'object') {
    return [];
  }

  // Handle Zod schema objects - check for _def.shape property (not a function)
  const zodSchema = inputSchema as { _def?: { shape?: Record<string, unknown> } };
  if (zodSchema._def?.shape && typeof zodSchema._def.shape === 'object') {
    return Object.keys(zodSchema._def.shape);
  }

  return [];
}

// Get tools
let tools = agentToolsLibrary;
if (filterCategory) {
  tools = getAgentToolsByCategory([filterCategory]);
}

// Extract tool information
const toolInfos: ToolInfo[] = Object.entries(tools).map(([name, tool]) => ({
  name,
  category: getToolCategory(name),
  description: (tool.description || 'No description').split('\n')[0], // First line only
  parameters: extractParameters(tool),
}));

// Output
if (outputFormat === 'json') {
  console.log(JSON.stringify(toolInfos, null, 2));
} else {
  // Group by category
  const byCategory: Record<string, ToolInfo[]> = {};
  for (const toolInfo of toolInfos) {
    if (!byCategory[toolInfo.category]) {
      byCategory[toolInfo.category] = [];
    }
    byCategory[toolInfo.category].push(toolInfo);
  }

  console.log('🤖 AI Agent Tools\n');
  console.log(`Total tools: ${toolInfos.length}\n`);

  for (const [category, categoryTools] of Object.entries(byCategory)) {
    console.log(`\n📁 ${category.toUpperCase()} (${categoryTools.length} tools)`);
    console.log('─'.repeat(60));

    for (const tool of categoryTools) {
      console.log(`\n  ${tool.name}`);
      console.log(`  ${tool.description}`);
      if (tool.parameters.length > 0) {
        console.log(`  Parameters: ${tool.parameters.join(', ')}`);
      }
    }
  }

  console.log('\n\n💡 Usage:');
  console.log('  --category <name>  Filter by category (web, ai, communication, utilities)');
  console.log('  --format json      Output as JSON');
  console.log('\nExamples:');
  console.log('  npx tsx scripts/list-agent-tools.ts --category web');
  console.log('  npx tsx scripts/list-agent-tools.ts --format json');
}

#!/usr/bin/env tsx
/**
 * LLM-Optimized Module Search
 *
 * Designed for LLMs to quickly find modules without context bloat.
 * Returns ONLY relevant information in a concise, structured format.
 *
 * Usage:
 *   npx tsx scripts/search-modules-llm.ts email
 *   npx tsx scripts/search-modules-llm.ts --category communication
 *   npx tsx scripts/search-modules-llm.ts --function sendEmail
 *   npx tsx scripts/search-modules-llm.ts --format json  # Machine-readable
 */

import { getModuleRegistry } from '../src/lib/workflows/module-registry';

const args = process.argv.slice(2);

// Parse flags
const formatFlag = args.find((arg) => arg === '--format')
  ? args[args.indexOf('--format') + 1]
  : 'json';  // Default to JSON for programmatic usage
const categoryFlag = args.find((arg) => arg === '--category')
  ? args[args.indexOf('--category') + 1]
  : null;
const functionFlag = args.find((arg) => arg === '--function')
  ? args[args.indexOf('--function') + 1]
  : null;
const limitFlag = args.find((arg) => arg === '--limit')
  ? parseInt(args[args.indexOf('--limit') + 1])
  : 10;

// Get search query (everything that's not a flag)
const query = args
  .filter((arg, i) => {
    const prev = args[i - 1];
    return !arg.startsWith('--') && prev !== '--format' && prev !== '--category' && prev !== '--function' && prev !== '--limit';
  })
  .join(' ')
  .toLowerCase();

interface ModuleInfo {
  path: string;
  description: string;
  signature: string;
  params: {
    name: string;
    required: boolean;
  }[];
  wrapper?: 'params' | 'options' | null;  // NEW: How to wrap parameters
  template?: Record<string, unknown>;      // NEW: Ready-to-use inputs template
  tags?: string[];                         // NEW: Use case tags
}

/**
 * Parse function signature to extract parameters
 */
function parseSignature(signature: string): { name: string; required: boolean }[] {
  const params: { name: string; required: boolean }[] = [];

  const match = signature.match(/\(([^)]*)\)/);
  if (!match || !match[1]) return params;

  const paramStr = match[1].trim();
  if (!paramStr) return params;

  // Handle object destructuring: { param1, param2, param3? }
  if (paramStr.startsWith('{')) {
    const paramMatch = paramStr.match(/\{\s*([^}]+)\s*\}/);
    if (paramMatch) {
      const paramList = paramMatch[1].split(',').map(p => p.trim());
      paramList.forEach(param => {
        const required = !param.endsWith('?');
        const name = param.replace('?', '').trim();
        params.push({ name, required });
      });
    }
  } else {
    // Handle regular parameters
    const paramList = paramStr.split(',').map(p => p.trim());
    paramList.forEach(param => {
      const required = !param.includes('?');
      const name = param.split(/[?:]/)[0].trim();
      if (name) params.push({ name, required });
    });
  }

  return params;
}

/**
 * Detect wrapper type from module path and signature
 */
function detectWrapperType(modulePath: string, signature: string): 'params' | 'options' | null {
  // AI SDK always uses options
  if (modulePath.startsWith('ai.ai-sdk.') || modulePath.startsWith('ai.ai-agent.')) {
    return 'options';
  }

  // Drizzle utils uses params
  if (modulePath.includes('drizzle-utils')) {
    return 'params';
  }

  // Check signature for hints
  if (signature.includes('(params:') || signature.includes('(params)')) {
    return 'params';
  }
  if (signature.includes('(options:') || signature.includes('(options)')) {
    return 'options';
  }

  // Direct parameters (no wrapper)
  const paramMatch = signature.match(/\(([^)]+)\)/);
  if (paramMatch) {
    const paramStr = paramMatch[1].trim();
    // If starts with { or has : without params/options keyword, it's direct
    if (paramStr.startsWith('{') || (paramStr.includes(':') && !paramStr.includes('params') && !paramStr.includes('options'))) {
      return null; // Direct parameters
    }
  }

  return null;
}

/**
 * Generate minimal template for inputs
 */
function generateTemplate(modulePath: string, params: { name: string; required: boolean }[], wrapper: 'params' | 'options' | null): Record<string, unknown> {
  const requiredParams = params.filter(p => p.required);

  // Special case: AI SDK - Include ALL required fields
  if (wrapper === 'options' && modulePath.startsWith('ai.ai-sdk.')) {
    return {
      options: {
        prompt: "{{YOUR_PROMPT}}",
        model: "gpt-4o-mini",
        apiKey: "{{credential.openai_api_key}}"
      }
    };
  }

  // Special case: drizzle-utils storage
  if (modulePath.includes('drizzle-utils.insertRecord')) {
    return {
      params: {
        workflowId: "{{workflowId}}",
        tableName: "YOUR_TABLE",
        data: { field: "{{value}}" }
      }
    };
  }

  if (modulePath.includes('drizzle-utils.queryWhereIn')) {
    return {
      params: {
        workflowId: "{{workflowId}}",
        tableName: "YOUR_TABLE",
        column: "id_field",
        values: "{{arrayVar}}"
      }
    };
  }

  // Generic template
  const paramObj: Record<string, string> = {};
  requiredParams.forEach(p => {
    paramObj[p.name] = `{{${p.name}}}`;
  });

  if (wrapper) {
    return { [wrapper]: paramObj };
  }
  return paramObj;
}

/**
 * Add tags for common use cases
 */
function generateTags(modulePath: string, description: string): string[] {
  const tags: string[] = [];
  const lower = `${modulePath} ${description}`.toLowerCase();

  if (lower.includes('twitter') || lower.includes('reddit') || lower.includes('linkedin')) tags.push('social');
  if (lower.includes('email') || lower.includes('slack') || lower.includes('discord')) tags.push('communication');
  if (lower.includes('generatetext') || lower.includes('ai-sdk') || lower.includes('agent')) tags.push('ai');
  if (lower.includes('storage') || lower.includes('database') || lower.includes('drizzle')) tags.push('storage');
  if (lower.includes('transform') || lower.includes('filter') || lower.includes('array')) tags.push('data-processing');

  return tags;
}

/**
 * Search modules and return results
 */
function searchModules(): ModuleInfo[] {
  const registry = getModuleRegistry();
  const results: ModuleInfo[] = [];

  registry.forEach((category) => {
    // Filter by category if specified
    if (categoryFlag && category.name.toLowerCase() !== categoryFlag.toLowerCase()) {
      return;
    }

    category.modules.forEach((mod) => {
      mod.functions.forEach((fn) => {
        // Filter by function name if specified
        if (functionFlag && fn.name.toLowerCase() !== functionFlag.toLowerCase()) {
          return;
        }

        const searchText = `${category.name} ${mod.name} ${fn.name} ${fn.description}`.toLowerCase();
        const modulePath = `${category.name}.${mod.name}.${fn.name}`;

        // If query provided, filter by it
        if (query && !searchText.includes(query)) {
          return;
        }

        const params = parseSignature(fn.signature);
        const wrapper = detectWrapperType(modulePath, fn.signature);
        const template = generateTemplate(modulePath, params, wrapper);
        const tags = generateTags(modulePath, fn.description);

        results.push({
          path: modulePath,
          description: fn.description,
          signature: fn.signature,
          params,
          wrapper: wrapper || undefined,
          template,
          tags: tags.length > 0 ? tags : undefined
        });
      });
    });
  });

  return results.slice(0, limitFlag);
}

/**
 * Format results for LLM consumption
 */
function formatResults(results: ModuleInfo[]): void {
  if (results.length === 0) {
    if (formatFlag === 'json') {
      console.log('[]');  // Valid empty JSON array
    } else {
      console.log('No modules found');
    }
    return;
  }

  if (formatFlag === 'json') {
    // Machine-readable JSON
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Compact text format for LLM context (ENHANCED)
  console.log(`Found ${results.length} module(s):\n`);

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.path}`);
    console.log(`   ${result.description}`);

    // Show wrapper type (CRITICAL for correctness)
    if (result.wrapper) {
      console.log(`   Wrapper: "${result.wrapper}" (use {"${result.wrapper}": {...}})`);
    } else {
      console.log(`   Wrapper: none (direct params)`);
    }

    // Show parameters inline
    const requiredParams = result.params.filter(p => p.required).map(p => p.name);
    const optionalParams = result.params.filter(p => !p.required).map(p => p.name);

    if (requiredParams.length > 0) {
      console.log(`   Required: ${requiredParams.join(', ')}`);
    }
    if (optionalParams.length > 0) {
      console.log(`   Optional: ${optionalParams.join(', ')}`);
    }

    // Show ready-to-use template (COMPACT - single line)
    console.log(`   Template: ${JSON.stringify(result.template)}`);

    // Show tags for context
    if (result.tags && result.tags.length > 0) {
      console.log(`   Tags: ${result.tags.join(', ')}`);
    }

    console.log('');
  });

  console.log(`💡 Use --format json for full details`);
  console.log(`💡 Use --limit N to control results (current: ${limitFlag})`);
}

/**
 * Show usage examples optimized for LLM understanding
 */
function showHelp(): void {
  console.log(`
LLM-Optimized Module Search
===========================

USAGE:
  search-modules-llm.ts <query>                    # Search by keyword
  search-modules-llm.ts --category <name>          # List category
  search-modules-llm.ts --function <name>          # Find exact function
  search-modules-llm.ts <query> --format json      # JSON output

FLAGS:
  --format json          Machine-readable output
  --limit N             Max results (default: 10)
  --category <name>     Filter by category
  --function <name>     Find exact function name

EXAMPLES FOR LLM:
  # Find email modules
  search-modules-llm.ts email

  # Get communication category (concise list)
  search-modules-llm.ts --category communication --limit 20

  # Find specific function
  search-modules-llm.ts --function sendEmail --format json

  # Search with context limit
  search-modules-llm.ts datetime --limit 5

OUTPUT FORMAT (text):
  1. category.module.function
     Description of what it does
     Required: param1, param2
     Optional: param3

OUTPUT FORMAT (json):
  [
    {
      "path": "category.module.function",
      "description": "...",
      "signature": "function(...)",
      "params": [
        {"name": "param1", "required": true},
        {"name": "param2", "required": false}
      ]
    }
  ]

TIPS FOR LLM WORKFLOW GENERATION:
  1. Search before building: "search email" → get exact module paths
  2. Use --limit to avoid context bloat (default is 10)
  3. Use --format json for structured parsing
  4. Copy module path directly to workflow JSON
  5. Check required vs optional params before generating inputs
`);
}

// Main execution
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  showHelp();
  process.exit(0);
}

const results = searchModules();
formatResults(results);

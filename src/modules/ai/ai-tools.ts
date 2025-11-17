import { type Tool } from 'ai';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getModuleRegistry } from '@/lib/workflows/module-registry';

/**
 * AI Tools Module - Dynamic Tool Generation
 *
 * Automatically generates AI SDK tool schemas from the module registry.
 * Allows AI agents to autonomously discover and execute workflow modules.
 *
 * Features:
 * - Auto-generates tool schemas from 140+ modules
 * - Dynamic module loading and execution
 * - Category filtering for focused tool sets
 * - Credential injection support
 * - Type-safe parameter schemas
 *
 * Perfect for:
 * - Agentic workflows with autonomous tool selection
 * - Multi-step reasoning with tool use
 * - Conversational agents with action capabilities
 * - Self-directed workflow construction
 */

export interface ToolGenerationOptions {
  /**
   * Filter to specific categories (e.g., ['social', 'ai', 'communication'])
   * If not provided, all categories will be included
   */
  categories?: string[];

  /**
   * Filter to specific modules (e.g., ['ai.ai-sdk', 'social.twitter'])
   * If not provided, all modules in selected categories will be included
   */
  modules?: string[];

  /**
   * Maximum number of tools to generate (for token limit management)
   * Default: unlimited
   */
  maxTools?: number;

  /**
   * User credentials for auto-injection
   * Format: { platform_apikey: 'sk-...', ... }
   */
  credentials?: Record<string, string>;
}

/**
 * Parse TypeScript function signature to extract parameter names and types
 * This is a simplified parser - for production, consider using TypeScript compiler API
 */
function parseSignatureToSchema(signature: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
  // Extract parameter list from signature
  // Examples: "generateText(options)", "searchTweets(query, limit?)", "postTweet({ text, apiKey? })"
  const paramMatch = signature.match(/\(([^)]*)\)/);
  const paramsStr = paramMatch?.[1]?.trim() || '';

  // Handle empty parameters
  if (!paramsStr) {
    return z.object({});
  }

  // For now, use a simplified schema that accepts any parameters
  // In Phase 2, we can enhance this to parse TypeScript types from module exports
  const schemaFields: Record<string, z.ZodTypeAny> = {};

  // Check if it's object destructuring syntax
  if (paramsStr.startsWith('{')) {
    // Extract property names from destructuring
    const propsMatch = paramsStr.match(/\{([^}]+)\}/);
    if (propsMatch) {
      const props = propsMatch[1].split(',').map(p => p.trim());
      for (const prop of props) {
        // Remove type annotations and optional markers
        const propName = prop.split(':')[0].replace('?', '').trim();
        if (propName) {
          // Mark as optional if it has ? or has default value
          const isOptional = prop.includes('?') || prop.includes('=');
          schemaFields[propName] = isOptional
            ? z.any().optional().describe(`Parameter: ${propName}`)
            : z.any().describe(`Parameter: ${propName}`);
        }
      }
    }
  } else {
    // Simple parameter list
    const params = paramsStr.split(',').map(p => p.trim());
    for (const param of params) {
      if (!param) continue;
      // Extract parameter name (before : or ?)
      const paramName = param.split(':')[0].replace('?', '').trim();
      if (paramName) {
        const isOptional = param.includes('?') || param.includes('=');
        schemaFields[paramName] = isOptional
          ? z.any().optional().describe(`Parameter: ${paramName}`)
          : z.any().describe(`Parameter: ${paramName}`);
      }
    }
  }

  // If we couldn't parse any fields, create a generic options parameter
  if (Object.keys(schemaFields).length === 0) {
    schemaFields.options = z.any().optional().describe('Function options');
  }

  return z.object(schemaFields);
}

/**
 * Create a tool executor that dynamically loads and calls module functions
 */
function createToolExecutor(
  categoryName: string,
  moduleName: string,
  functionName: string,
  credentials?: Record<string, string>
) {
  return async (params: Record<string, unknown>) => {
    logger.info(
      {
        category: categoryName,
        module: moduleName,
        function: functionName,
        paramKeys: Object.keys(params),
      },
      'Executing tool via AI agent'
    );

    try {
      // Dynamic import of module
      const moduleFile = await import(`@/modules/${categoryName}/${moduleName}`);

      if (!moduleFile[functionName]) {
        throw new Error(
          `Function ${functionName} not found in module ${categoryName}/${moduleName}`
        );
      }

      const func = moduleFile[functionName];

      // Auto-inject credentials if available
      const actualParams = { ...params };
      if (credentials && !actualParams.apiKey) {
        // Try common credential patterns
        const possibleKeys = [
          `${moduleName}_apikey`,
          `${moduleName}_api_key`,
          `${moduleName}`,
        ];

        for (const key of possibleKeys) {
          if (credentials[key]) {
            actualParams.apiKey = credentials[key];
            logger.info(
              { credentialKey: key, module: moduleName },
              'Auto-injected API key credential'
            );
            break;
          }
        }
      }

      // Call the function
      const result = await func(actualParams);

      logger.info(
        {
          category: categoryName,
          module: moduleName,
          function: functionName,
          success: true,
        },
        'Tool execution completed'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          category: categoryName,
          module: moduleName,
          function: functionName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Tool execution failed'
      );
      throw error;
    }
  };
}

/**
 * Generate AI SDK tools from module registry
 */
export function generateToolsFromModules(
  options: ToolGenerationOptions = {}
): Record<string, Tool> {
  const { categories, modules: moduleFilter, maxTools, credentials } = options;

  const registry = getModuleRegistry();
  const tools: Record<string, Tool> = {};
  let toolCount = 0;

  logger.info(
    {
      categoryFilter: categories,
      moduleFilter,
      maxTools,
      hasCredentials: !!credentials,
    },
    'Generating AI tools from module registry'
  );

  for (const category of registry) {
    // Filter by category if specified
    if (categories && !categories.includes(category.name)) {
      continue;
    }

    for (const registryModule of category.modules) {
      const moduleFullName = `${category.name}.${registryModule.name}`;

      // Filter by module if specified
      if (moduleFilter && !moduleFilter.includes(moduleFullName)) {
        continue;
      }

      for (const func of registryModule.functions) {
        // Check max tools limit
        if (maxTools && toolCount >= maxTools) {
          logger.info(
            { maxTools, toolCount },
            'Reached max tools limit, stopping generation'
          );
          return tools;
        }

        // Create tool name (use underscore separator for AI SDK compatibility)
        const toolName = `${category.name}_${registryModule.name}_${func.name}`;

        // Generate parameter schema from signature
        const parameterSchema = parseSignatureToSchema(func.signature);

        // Create the tool
        tools[toolName] = {
          description: `${func.description} [Module: ${category.name}.${registryModule.name}.${func.name}]`,
          inputSchema: parameterSchema,
          execute: createToolExecutor(category.name, registryModule.name, func.name, credentials),
        };

        toolCount++;
      }
    }
  }

  logger.info(
    { toolCount, categoryCount: categories?.length || 'all' },
    'Tool generation completed'
  );

  return tools;
}

/**
 * Generate tools for a specific category (convenience function)
 */
export function generateToolsForCategory(
  categoryName: string,
  credentials?: Record<string, string>
): Record<string, Tool> {
  return generateToolsFromModules({
    categories: [categoryName],
    credentials,
  });
}

/**
 * Generate a focused tool set for common agent use cases
 */
export function generateAgentTools(
  preset: 'social' | 'communication' | 'productivity' | 'data' | 'ai' | 'all',
  credentials?: Record<string, string>
): Record<string, Tool> {
  const presetCategories: Record<string, string[]> = {
    social: ['social', 'communication'],
    communication: ['communication', 'productivity'],
    productivity: ['productivity', 'data', 'utilities'],
    data: ['data', 'dataprocessing', 'utilities'],
    ai: ['ai', 'utilities'],
    all: [], // Empty means all categories
  };

  const categories = presetCategories[preset] || [];

  return generateToolsFromModules({
    categories: categories.length > 0 ? categories : undefined,
    credentials,
  });
}

/**
 * Get tool count for a given configuration
 */
export function getToolCount(options: ToolGenerationOptions = {}): number {
  const { categories, modules: moduleFilter } = options;
  const registry = getModuleRegistry();
  let count = 0;

  for (const category of registry) {
    if (categories && !categories.includes(category.name)) continue;

    for (const registryModule of category.modules) {
      const moduleFullName = `${category.name}.${registryModule.name}`;
      if (moduleFilter && !moduleFilter.includes(moduleFullName)) continue;

      count += registryModule.functions.length;
    }
  }

  return count;
}

/**
 * List available tools for a given configuration
 */
export function listAvailableTools(
  options: ToolGenerationOptions = {}
): Array<{ name: string; description: string; module: string }> {
  const { categories, modules: moduleFilter } = options;
  const registry = getModuleRegistry();
  const toolList: Array<{ name: string; description: string; module: string }> = [];

  for (const category of registry) {
    if (categories && !categories.includes(category.name)) continue;

    for (const registryModule of category.modules) {
      const moduleFullName = `${category.name}.${registryModule.name}`;
      if (moduleFilter && !moduleFilter.includes(moduleFullName)) continue;

      for (const func of registryModule.functions) {
        toolList.push({
          name: `${category.name}_${registryModule.name}_${func.name}`,
          description: func.description,
          module: moduleFullName,
        });
      }
    }
  }

  return toolList;
}

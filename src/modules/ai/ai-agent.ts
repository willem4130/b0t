import { generateText as aiGenerateText, type Tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createCircuitBreaker } from '@/lib/resilience';
import { createRateLimiter, withRateLimit } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';
import { getAllAgentTools, getAgentToolsByCategory, getAgentTools } from './agent-tools-library';

/**
 * AI Agent Module - Autonomous Tool-Using AI
 *
 * Enables AI agents to autonomously select and execute tools from the module registry.
 * Agents can perform multi-step reasoning, chain tool calls, and self-direct workflows.
 *
 * Features:
 * - Autonomous tool selection from 140+ modules
 * - Multi-step reasoning with tool use
 * - Conversation history support
 * - Configurable tool sets via category/module filters
 * - Automatic credential injection
 * - Circuit breakers and rate limiting
 *
 * Perfect for:
 * - Self-directed workflow construction
 * - Complex multi-step tasks requiring planning
 * - Conversational agents with action capabilities
 * - Autonomous social media management
 * - Data analysis and reporting workflows
 */

// Rate limiter: Conservative limits for agent operations
const agentRateLimiter = createRateLimiter({
  maxConcurrent: 3, // Agents are more resource-intensive
  minTime: 500,
  reservoir: 200,
  reservoirRefreshAmount: 200,
  reservoirRefreshInterval: 60 * 1000,
  id: 'ai-agent',
});

export type AIProvider = 'openai' | 'anthropic';
export type AIModel = string;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentRunOptions {
  /**
   * The user's input/goal for the agent
   */
  prompt: string;

  /**
   * System prompt defining agent's role and behavior
   */
  systemPrompt?: string;

  /**
   * AI model to use (default: claude-3-5-sonnet-20241022)
   */
  model?: AIModel;

  /**
   * AI provider (default: auto-detected from model)
   */
  provider?: AIProvider;

  /**
   * Maximum number of reasoning/tool-use steps (default: 10)
   */
  maxSteps?: number;

  /**
   * Temperature for generation (default: 0.7)
   */
  temperature?: number;

  /**
   * Conversation history (for multi-turn conversations)
   */
  conversationHistory?: AIMessage[];

  /**
   * Tool selection options
   */
  toolOptions?: {
    /**
     * Select tools by category: 'web', 'ai', 'communication', 'utilities', or 'all'
     */
    categories?: string[];
    /**
     * Select specific tools by name
     */
    tools?: string[];
    /**
     * Use all available tools (default if no options provided)
     */
    useAll?: boolean;
    /**
     * Enable MCP (Model Context Protocol) tools
     */
    useMCP?: boolean;
    /**
     * Specific MCP servers to use (if useMCP is true)
     * Example: ['tavily-search', 'brave-search', 'fetch']
     */
    mcpServers?: string[];
  };

  /**
   * Custom tools to include (merged with auto-generated tools)
   */
  customTools?: Record<string, Tool>;

  /**
   * API key for the AI provider
   */
  apiKey?: string;
}

export interface AgentStepResult {
  type: 'tool-call' | 'text';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  text?: string;
}

export interface AgentRunResponse {
  /**
   * Final text response from the agent
   */
  text: string;

  /**
   * All reasoning/tool steps taken by the agent
   */
  steps: AgentStepResult[];

  /**
   * Tool calls made during execution
   */
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;

  /**
   * Token usage statistics
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /**
   * Finish reason
   */
  finishReason: string;

  /**
   * Model used
   */
  model: string;

  /**
   * Provider used
   */
  provider: AIProvider;
}

/**
 * Get the AI model instance based on provider and model name
 */
function getModelInstance(provider: AIProvider, modelName: string, apiKey?: string) {
  if (provider === 'openai') {
    if (!apiKey) {
      throw new Error(
        'OpenAI API key not found. Please add an OpenAI API key in the credentials page.'
      );
    }
    const openaiProvider = createOpenAI({
      apiKey: apiKey,
    });
    return openaiProvider(modelName);
  } else if (provider === 'anthropic') {
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not found. Please add an Anthropic API key in the credentials page.'
      );
    }
    const anthropicProvider = createAnthropic({
      apiKey: apiKey,
    });
    return anthropicProvider(modelName);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Detect provider from model name
 */
function detectProvider(model?: string): AIProvider {
  if (!model) return 'anthropic'; // Default to Claude for agents

  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
    return 'openai';
  }

  if (model.startsWith('claude-')) {
    return 'anthropic';
  }

  return 'anthropic'; // Default to Claude
}

/**
 * Internal run agent function (unprotected)
 */
async function runAgentInternal(options: AgentRunOptions): Promise<AgentRunResponse> {
  const {
    prompt,
    systemPrompt = 'You are a helpful AI assistant with access to various tools. Use tools when needed to accomplish tasks.',
    model = 'claude-3-5-sonnet-20241022',
    provider: explicitProvider,
    maxSteps = 10,
    temperature = 0.7,
    conversationHistory = [],
    toolOptions = {},
    customTools = {},
    apiKey,
  } = options;

  const provider = explicitProvider || detectProvider(model);

  logger.info(
    {
      model,
      provider,
      maxSteps,
      promptLength: prompt.length,
      hasHistory: conversationHistory.length > 0,
      toolOptions,
    },
    'Starting AI agent run'
  );

  // Load tools from curated library
  let libraryTools: Record<string, Tool> = {};

  if (toolOptions?.tools && toolOptions.tools.length > 0) {
    // Use specific tools
    libraryTools = getAgentTools(toolOptions.tools);
    logger.info({ toolNames: toolOptions.tools }, 'Using specific tools');
  } else if (toolOptions?.categories && toolOptions.categories.length > 0) {
    // Use tools by category
    libraryTools = getAgentToolsByCategory(toolOptions.categories);
    logger.info({ categories: toolOptions.categories }, 'Using tools by category');
  } else {
    // Use all tools (default)
    libraryTools = getAllAgentTools();
    logger.info('Using all available tools');
  }

  // Load MCP tools if enabled
  let mcpTools: Record<string, Tool> = {};
  if (toolOptions?.useMCP) {
    try {
      const { getMCPAgentTools } = await import('./agent-tools-library');
      mcpTools = await getMCPAgentTools(toolOptions.mcpServers);
      logger.info(
        {
          mcpToolCount: Object.keys(mcpTools).length,
          mcpServers: toolOptions.mcpServers,
        },
        'Loaded MCP tools for agent'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Failed to load MCP tools');
    }
  }

  const allTools = { ...libraryTools, ...mcpTools, ...customTools };
  const toolCount = Object.keys(allTools).length;

  logger.info(
    {
      libraryToolCount: Object.keys(libraryTools).length,
      mcpToolCount: Object.keys(mcpTools).length,
      customToolCount: Object.keys(customTools).length,
      totalToolCount: toolCount,
    },
    'Tools loaded for agent'
  );

  // Build messages array
  const messages = [
    ...conversationHistory.filter((m) => m.role !== 'system'),
    { role: 'user' as const, content: prompt },
  ];

  // Get system prompt (prefer from conversation history if present)
  const systemMessage = conversationHistory.find((m) => m.role === 'system');
  const finalSystemPrompt = systemMessage?.content || systemPrompt;

  // Get model instance
  const modelInstance = getModelInstance(provider, model, apiKey);

  // Track tool calls as they happen
  const toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }> = [];

  // Execute agent with tools and track tool calls
  const result = await aiGenerateText({
    model: modelInstance,
    messages,
    system: finalSystemPrompt,
    tools: allTools,
    temperature,
    stopWhen: stepCountIs(maxSteps),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'ai-agent',
    },
    onStepFinish: async ({ toolCalls: stepToolCalls, toolResults }) => {
      // Track tool calls
      if (stepToolCalls && stepToolCalls.length > 0) {
        for (let i = 0; i < stepToolCalls.length; i++) {
          const toolCall = stepToolCalls[i];
          const toolResult = toolResults?.[i];

          toolCalls.push({
            name: toolCall.toolName,
            args: ('input' in toolCall ? toolCall.input : ('args' in toolCall ? (toolCall as unknown as { args: Record<string, unknown> }).args : {})) as Record<string, unknown>,
            result: toolResult ? ('output' in toolResult ? toolResult.output : ('result' in toolResult ? (toolResult as unknown as { result: unknown }).result : undefined)) : undefined,
          });

          logger.info(
            {
              toolName: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
            },
            'Agent tool call tracked'
          );
        }
      }
    },
  });

  const steps: AgentStepResult[] = [
    {
      type: 'text',
      text: result.text,
    },
  ];

  logger.info(
    {
      model,
      provider,
      stepCount: steps.length,
      toolCallCount: toolCalls.length,
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
      finishReason: result.finishReason,
    },
    'AI agent run completed'
  );

  return {
    text: result.text,
    steps,
    toolCalls,
    usage: {
      promptTokens: result.usage.inputTokens || 0,
      completionTokens: result.usage.outputTokens || 0,
      totalTokens: result.usage.totalTokens || 0,
    },
    finishReason: result.finishReason,
    model,
    provider,
  };
}

/**
 * Run agent with circuit breaker and rate limiting
 */
const runAgentWithBreaker = createCircuitBreaker(runAgentInternal, {
  timeout: 120000, // 2 minutes for agent operations (multiple tool calls)
  name: 'ai-agent-run',
});

const runAgentRateLimited = withRateLimit(
  async (options: AgentRunOptions) => runAgentWithBreaker.fire(options),
  agentRateLimiter
);

/**
 * Run an AI agent with tool access (main export)
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResponse> {
  return (await runAgentRateLimited(options)) as unknown as AgentRunResponse;
}

/**
 * Convenience function: Run agent with web tools (search, fetch content)
 */
export async function runWebAgent(
  prompt: string
): Promise<AgentRunResponse> {
  return runAgent({
    prompt,
    systemPrompt:
      'You are a web research assistant. You can search the web and fetch content from any URL to help answer questions and gather information.',
    toolOptions: {
      categories: ['web'],
    },
  });
}

/**
 * Convenience function: Run agent with AI generation tools
 */
export async function runCreativeAgent(
  prompt: string
): Promise<AgentRunResponse> {
  return runAgent({
    prompt,
    systemPrompt:
      'You are a creative AI assistant. You can generate text, images, and other creative content using AI models.',
    toolOptions: {
      categories: ['ai'],
    },
  });
}

/**
 * Convenience function: Run agent with communication tools
 */
export async function runCommunicationAgent(
  prompt: string
): Promise<AgentRunResponse> {
  return runAgent({
    prompt,
    systemPrompt:
      'You are a communication assistant. You can send emails and messages to help you communicate with others.',
    toolOptions: {
      categories: ['communication'],
    },
  });
}

/**
 * Convenience function: Run agent with all available tools
 */
export async function runUniversalAgent(
  prompt: string
): Promise<AgentRunResponse> {
  return runAgent({
    prompt,
    systemPrompt:
      'You are a universal AI assistant with access to various tools including web search, content fetching, text generation, image generation, email sending, and utilities.',
    toolOptions: {
      useAll: true,
    },
  });
}
